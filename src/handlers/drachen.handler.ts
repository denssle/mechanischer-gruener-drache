import {TextChannel} from 'discord.js';
import client from '../client.js';
import drachenService from '../services/drachen.service.js';
import characterService, {CharacterLink, findLinkForName} from '../services/character.service.js';

// Drachentötungs-Gratulation. Einen Dragonkill-Zähler gibt es öffentlich NICHT (die Kriegerliste
// hat nur Gilde/Name/Ort/Stufe/Rasse/Geschlecht/Lebt/"Zuletzt da"), aber einen sauberen Proxy:
// Nach einer Drachentötung fällt der Charakter vom Max-Level auf Stufe 1 zurück. Ein solcher
// Level-STURZ ist praktisch immer ein Drachenkill - im Spiel gibt es keinen anderen Weg, viele
// Stufen auf einmal zu verlieren (Sterben delevelt nicht).
//
// Bewusst OPPORTUNISTISCH statt per Timer: geprüft wird mit den Daten, die /online und
// /charakter anzeigen ohnehin abrufen - kein zusätzlicher Abruf bei lotgd.de, kein zweiter
// Scheduling-Mechanismus. Eine Gratulation darf Stunden oder Tage später kommen.

// Das Spiel geht bis Stufe 15, erst dort ist der Drache fällig. Verlangt wird trotzdem nur ein
// Sturz von MIN_ALTES_LEVEL abwärts, nicht exakt von 15: unser letzter gesehener Stand kann
// älter sein (jemand steigt zwischen zwei Beobachtungen von 12 auf 15 und tötet den Drachen -
// mit "exakt 15" wäre die Tötung unsichtbar). Ein Rückgang von 10+ auf 1 hat keine andere
// Ursache, der Puffer kostet also keine Genauigkeit.
export const MIN_ALTES_LEVEL = 10;

// Nach der Tötung steht der Charakter wieder bei 1 - bewusst "genau 1" statt "irgendein
// Rückgang": Level kann durch andere Effekte schwanken, der Drachenkill setzt zurück.
export const NEUES_LEVEL = 1;

// Abschluss-Zeilen der Gratulation (emojifrei wie alle Bot-Antworten, lore-stimmig wie die
// TOTEN_FLAVORS in character.handler). Exportiert + getestet.
export const DRACHEN_FLAVORS = [
    'Der Drache liegt, das Wyrmland atmet auf.',
    'Ein Drache weniger – und wieder alles auf Anfang, bei Stufe 1.',
    'Die Schuppen sind gefallen, die Reise beginnt von vorn.',
    'Der Drache ist erlegt. Die Kunde davon eilt durch die Städte.',
    'Wieder ein Drache, der das Wyrmland nicht mehr heimsucht.',
];

export function randomDrachenFlavor(): string {
    return DRACHEN_FLAVORS[Math.floor(Math.random() * DRACHEN_FLAVORS.length)];
}

// Die Level-Spalte kommt aus dem HTML als String. null = unbrauchbar (leer, Text, kaputtes
// Markup) - dann wird der Charakter in dieser Runde einfach übersprungen, statt mit NaN zu rechnen.
export function parseLevel(roh: string | undefined): number | null {
    const level = parseInt((roh ?? '').trim(), 10);
    return Number.isFinite(level) ? level : null;
}

// Der eigentliche Test, rein + exportiert + getestet: Sturz von hoher Stufe auf genau 1.
export function istDrachentoetung(altesLevel: number, neuesLevel: number): boolean {
    return neuesLevel === NEUES_LEVEL && altesLevel >= MIN_ALTES_LEVEL;
}

export function formatGratulation(discordUserId: string, anzeigeName: string): string {
    return `**${anzeigeName}** hat den Drachen erlegt – Glückwunsch, <@${discordUserId}>!\n`
        + randomDrachenFlavor();
}

// Ein beobachteter Charakter: Anzeigename aus dem Spiel (kann ein Titel-Präfix tragen) + Stufe
// als Rohstring. Passt auf OnlinePlayer wie auf CharacterEntry - beide Quellen liefern beides.
export interface LevelBeobachtung {
    name: string;
    level: string;
}

class DrachenHandler {
    // Wird von /online und /charakter anzeigen mit den ohnehin geholten Daten gefüttert.
    // Fehlertolerant wie alle Nebenaufgaben: eine Gratulation darf den auslösenden Befehl
    // niemals kosten, deshalb try/catch um alles und Aufruf per void an der Rufstelle.
    async pruefeLevel(beobachtungen: LevelBeobachtung[]): Promise<void> {
        try {
            // Ohne konfigurierten Kanal wird gar nichts getan - auch NICHT mitgeschrieben.
            // Sonst würde ein Sturz still verbraucht (der Stand stünde danach auf 1, die Feier
            // wäre für immer weg). So beginnt die Beobachtung sauber, sobald ein Kanal da ist.
            const channel = await this.holeAnkuendigungskanal();
            if (!channel) return;

            // Gratuliert wird nur für VERKNÜPFTE Charaktere - ohne Discord-User gäbe es niemanden
            // zu beglückwünschen. Damit ist der Level-Speicher auch klein (eine Handvoll Namen).
            const links = await characterService.getAllLinks();
            if (links.length === 0) return;

            const bekannteLevel = await drachenService.getLevels();

            for (const beobachtung of beobachtungen) {
                const link = findLinkForName(links, beobachtung.name);
                if (!link) continue;

                const neuesLevel = parseLevel(beobachtung.level);
                if (neuesLevel === null) continue;

                // Gespeichert wird unter dem KERN-Namen (link.name), nicht unter dem Anzeigenamen:
                // dessen Titel-Präfix wechselt mit der Stufe, der Schlüssel würde bei jedem
                // Aufstieg ein anderer und der Vergleich liefe ins Leere.
                const altesLevel = parseLevel(bekannteLevel[link.name]);
                await drachenService.setLevel(link.name, neuesLevel);

                if (altesLevel === null || !istDrachentoetung(altesLevel, neuesLevel)) continue;

                // Meldesperre: der Roster ist bis zu 10 Minuten gecacht, ein alter Abruf kann nach
                // der Tötung noch die hohe Stufe liefern - die landet als "neuer Stand" im Speicher
                // und der nächste frische Abruf sähe denselben Sturz ein zweites Mal.
                if (await drachenService.istGemeldet(link.name)) continue;

                await this.gratuliere(channel, link, beobachtung.name);
            }
        } catch (error) {
            console.error('Fehler bei der Drachentötungs-Prüfung:', error);
        }
    }

    // Die Sperre wird nur bei erfolgreichem Post gesetzt - scheitert das Senden, darf die
    // Gratulation beim nächsten Mal noch nachkommen (Muster der Beobachtungsliste).
    private async gratuliere(channel: TextChannel, link: CharacterLink, anzeigeName: string): Promise<void> {
        try {
            // Der Ping ist hier der Sinn der Sache (wie beim Geburtstagsgruß), also bewusst
            // OHNE allowedMentions-Einschränkung - anders als /online oder die Ruhmeshalle,
            // wo Mentions nur der Zuordnung dienen.
            await channel.send(formatGratulation(link.discordUserId, anzeigeName));
            await drachenService.merkeGemeldet(link.name);
        } catch (error) {
            console.error(`Fehler beim Posten der Drachentötungs-Gratulation für ${link.name}:`, error);
        }
    }

    // Konfigurierter Spielwelt-Ankündigungskanal oder null (nicht gesetzt bzw. nicht abrufbar).
    private async holeAnkuendigungskanal(): Promise<TextChannel | null> {
        const channelId = await drachenService.getChannel();
        if (!channelId) return null;

        const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
        if (!channel) {
            console.warn(`Spielwelt-Ankündigungskanal ${channelId} nicht abrufbar - Gratulation wird verworfen.`);
            return null;
        }
        return channel;
    }
}

export default new DrachenHandler();
