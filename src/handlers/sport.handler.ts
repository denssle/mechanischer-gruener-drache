import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    Message,
    MessageFlags,
    OmitPartialGroupDMChannel,
    PartialMessage,
} from 'discord.js';

import sportService from '../services/sport.service.js';

import {
    ErkannteSportLeistung,
    SportActivities,
    SportActivity,
} from '../types/sport.js';

import campHandler from './camp.handler.js';
import ankuendigungskanalService from '../services/ankuendigungskanal.service.js';

// Ohne Schlüsselwort im Text wird Laufen angenommen (bewusst: lieber ein Eintrag mit der
// häufigsten Aktivität als gar keiner - die Distanz zählt fürs kooperative Gesamtziel).
export const DEFAULT_AKTIVITAET: SportActivity = 'laufen';

// Quittung der Auto-Erfassung. Funktionaler Statusmarker (wie im Audit-Log), keine Deko - er ist
// die einzige Rückmeldung, die ohne eigenen Post im Kanal auskommt.
export const BESTAETIGUNGS_REAKTION = '✅';

// Rückfrage der Auto-Erfassung (seit 2026-10-21): die Nachricht sieht nach einem Eintrag aus, der
// Parser versteht sie aber nicht. Vorher blieb sie einfach ohne Reaktion - von außen nicht von
// "Bot ist kaputt" zu unterscheiden. Ebenfalls funktionaler Marker, verschwindet nach erfolgreicher
// Korrektur wieder.
export const RUECKFRAGE_REAKTION = '❓';

// Lokales Datum als YYYY-MM-DD (Host läuft auf Europe/Berlin, wie beim Event-Feature).
// Bewusst aus den lokalen Datumsteilen gebaut statt toISOString(), das in UTC umrechnet und
// dadurch um Mitternacht auf den falschen Tag fallen würde. Dient als Tagesmarker für die
// tägliche Aktivitätsstand-Meldung (Doppelpost-Schutz).
export function formatTag(date: Date): string {
    const jahr = date.getFullYear();
    const monat = String(date.getMonth() + 1).padStart(2, '0');
    const tag = String(date.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
}

// Kaufmännisch auf ganze Kilometer runden - NUR für die Anzeige der gemeinsamen Gesamtsumme
// (Eintrags-Embed, /sport gesamt, Mitternachts-Post). Der gespeicherte Wert bleibt exakt (sonst gingen
// bei jedem Eintrag Nachkommastellen verloren und die Summe driftete), und die Meilenstein-
// Schwellenprüfung (`checkAndMarkReachedMilestones` im Service) rechnet bewusst weiter mit dem exakten
// Wert - sonst gälte eine Schwelle bei 1999,5 km schon als erreicht. Exportiert + getestet.
export function rundeKilometer(km: number): number {
    return Math.round(km);
}

// Persönliche Kilometerwerte behalten ihre Nachkommastellen.
// Es werden nur Fließkomma-Artefakte wie 3.3000000000000003 entfernt.
export function bereinigeKilometer(km: number): number {
    return Math.round(km * 100) / 100;
}

// Aktivitätsminuten werden wie Kilometer nur für die Anzeige gerundet.
// Der gespeicherte Wert bleibt exakt, damit Nachkommastellen bei der Summierung erhalten bleiben.
export function rundeMinuten(minuten: number): number {
    return Math.round(minuten);
}

// Schlüsselwörter je Aktivität für den Auto-Listener. Bewusst am WORTANFANG verankert (\b) statt
// als simples includes: "rad" steckt sonst in "Grad" ("12 km bei 30 Grad") und "gerad" in "gerade"
// ("ich bin gerade 12 km") - beides würde fälschlich als Radfahren eingetragen.
const AKTIVITAET_PATTERNS: Record<SportActivity, RegExp> = {
    laufen: /\b(lauf|gelaufen|renn|gerannt|jogg)/i,
    radfahren: /\b(rad|fahrrad|geradelt|bike|velo)/i,
    schwimmen: /\b(schwimm|geschwommen|schwomm)/i,
    wandern: /\b(wander|gewandert)/i,
    skifahren: /\b(ski|langlauf)/i,
    krafttraining: /\b(krafttraining|kraftsport|hantel|gewichtheben)/i,
};

// Zieht die erste Kilometer-Angabe aus einem Text: "+12 km", "+12km", "+12,5 km", "+12 Kilometer".
// Das "+" ist PFLICHT (seit 2026-07-14): ohne den Marker wurde im Sport-Kanal auch beiläufig
// erwähnte Distanz ("die Strecke sind 12 km") eingetragen - der Eintrag ist jetzt eine bewusste Geste.
// Bewusst nur die ERSTE (anders als beim Blåhaj-Rechner, der alle Beträge summiert): eine
// versehentlich doppelt gezählte Distanz verfälscht die gemeinsame Gesamtstrecke dauerhaft.
// Exportiert + getestet.
export function parseKilometer(text: string): number | null {
    const match = /\+\s*(\d+(?:[.,]\d+)?)\s*(?:km\b|kilometer\b)/i.exec(text);
    if (!match) return null;

    const value = parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
}

// Zieht die erste Minuten-Angabe aus einem Text: "+45 min", "+45min", "+45,5 min", "+45 Minuten".
// Wie bei den Kilometern ist das "+" PFLICHT: ohne den Marker könnten beiläufig erwähnte Zeiten
// ("ich trainiere seit 45 Minuten") versehentlich als Aktivität eingetragen werden.
// Bewusst nur die ERSTE Minuten-Angabe, damit eine versehentliche Mehrfachnennung nicht doppelt zählt.
// Minuten werden unabhängig von Kilometern erfasst - eine Nachricht kann daher nur Minuten
// oder sowohl Kilometer als auch Minuten enthalten.
// Exportiert + getestet.
export function parseMinuten(text: string): number | null {
    const match = /\+\s*(\d+(?:[.,]\d+)?)\s*(?:min\b|minuten\b)/i.exec(text);
    if (!match) return null;

    const value = parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
}

// Alle Sportwörter eines Textes samt Position. `ende` reicht bis zum Wortende, nicht nur bis zum
// Ende des Musters ("Schwimm|en") - sonst sähe der Rest des Wortes wie weiterer Text aus.
interface AktivitaetsWort {
    aktivitaet: SportActivity;
    index: number;
    ende: number;
}

function findeAktivitaetsWoerter(text: string): AktivitaetsWort[] {
    const woerter: AktivitaetsWort[] = [];

    for (const [aktivitaet, pattern] of Object.entries(AKTIVITAET_PATTERNS) as [SportActivity, RegExp][]) {
        for (const treffer of text.matchAll(new RegExp(pattern.source, 'gi'))) {
            const rest = /^\p{L}*/u.exec(text.slice(treffer.index + treffer[0].length))![0];
            woerter.push({aktivitaet, index: treffer.index, ende: treffer.index + treffer[0].length + rest.length});
        }
    }

    return woerter.sort((a, b) => a.index - b.index);
}

// Erkennt die Aktivität anhand des ERSTEN Sportworts im Text (nach Position, nicht nach der
// Reihenfolge in AKTIVITAET_PATTERNS). Ohne Treffer: DEFAULT_AKTIVITAET.
export function erkenneAktivitaet(text: string): SportActivity {
    return findeAktivitaetsWoerter(text)[0]?.aktivitaet ?? DEFAULT_AKTIVITAET;
}

// Ohne Sportart: Kilometer gelten als Laufen, Minuten als Krafttraining.
function standardAktivitaet(istKilometer: boolean): SportActivity {
    return istKilometer ? DEFAULT_AKTIVITAET : 'krafttraining';
}

// Seit 2026-10-21 passt jede Einheit zu jeder Sportart ("+240 min schwimmen" wurde vorher als
// Widerspruch verworfen, weil Schwimmen nur Kilometer kannte). Damit gibt es keinen Grund mehr,
// eine Nachricht zu verwerfen - zugeordnet wird nur noch, WELCHE Sportart zu welcher Angabe gehört.
export function erkenneSportLeistungen(text: string): ErkannteSportLeistung[] {
    const leistungen: ErkannteSportLeistung[] = [];

    const matches = [...text.matchAll(
        /\+\s*(\d+(?:[.,]\d+)?)\s*(km\b|kilometer\b|min\b|minuten\b)/gi
    )];

    if (matches.length === 0) return [];

    // Steht bereits vor der ersten Leistungsangabe eine Sportart,
    // wird die Nachricht als "Sportart + Leistung" gelesen.
    const sportartStehtDavor =
        findeAktivitaetsWoerter(text.slice(0, matches[0].index)).length > 0;

    // Sportart, die im Abschnitt der vorigen Angabe stand, aber zur aktuellen gehört
    // ("+5 km und Schwimmen +30 min").
    let uebertrag: SportActivity | null = null;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const wert = parseFloat(match[1].replace(',', '.'));
        const einheit = match[2].toLowerCase();
        const istKilometer = einheit === 'km' || einheit === 'kilometer';

        let abschnitt: string;

        if (sportartStehtDavor) {
            // "Radfahren +5 km, Laufen +10 km"
            // Jede Sportart gehört zur folgenden Leistungsangabe.
            const start = i === 0
                ? 0
                : matches[i - 1].index + matches[i - 1][0].length;

            abschnitt = text.slice(start, match.index);
        } else {
            // "+5 km gelaufen, danach +20 km Rad"
            // Normalerweise gehört die Sportart hinter die Leistungsangabe.
            const start = match.index + match[0].length;
            const ende = matches[i + 1]?.index ?? text.length;

            abschnitt = text.slice(start, ende);
        }

        let naechsterUebertrag: SportActivity | null = null;

        if (!sportartStehtDavor && i < matches.length - 1) {
            // Sonderfall: "+5 km und Krafttraining +30 min". Das letzte Sportwort vor der
            // nächsten Angabe gehört zu ihr, wenn es durch ein Trennwort von der aktuellen
            // abgesetzt ist und danach nichts mehr kommt. Ohne Trennwort ("+2 km geschwommen
            // +30 min") bleibt es bei der aktuellen Angabe.
            const letztes = findeAktivitaetsWoerter(abschnitt).at(-1);

            if (
                letztes &&
                /(?:,|\bund|\bdanach|\bdann)\s*$/i.test(abschnitt.slice(0, letztes.index)) &&
                /^[\s,]*$/.test(abschnitt.slice(letztes.ende))
            ) {
                naechsterUebertrag = letztes.aktivitaet;
                abschnitt = abschnitt.slice(0, letztes.index);
            }
        }

        const genannt = findeAktivitaetsWoerter(abschnitt)[0]?.aktivitaet;
        const aktivitaet = genannt ?? uebertrag ?? standardAktivitaet(istKilometer);
        uebertrag = naechsterUebertrag;

        if (!Number.isFinite(wert) || wert <= 0) continue;

        leistungen.push(istKilometer
            ? {aktivitaet, kilometer: wert}
            : {aktivitaet, minuten: wert});
    }

    return leistungen;
}

// Sieht eine Nachricht nach einem gemeinten Eintrag aus, den der Parser nicht versteht?
// "+" vor einer Zahl UND (ein Sportwort oder eine Einheit, die wir nicht kennen: "+2 h", "+500 m").
// Bewusst nicht jedes "+1": ein "+1, bin dabei" im Sport-Kanal soll kein ❓ bekommen.
export function siehtNachSportAus(text: string): boolean {
    if (!/\+\s*\d/.test(text)) return false;

    return findeAktivitaetsWoerter(text).length > 0 ||
        /\+\s*\d+(?:[.,]\d+)?\s*(?:h|std|stunden?|m|meter)\b/i.test(text);
}

// Exportiert wie CHARAKTER_HELP/SPIELWELT_HELP, damit ein Test die km-Beispiele darin gegen den
// echten parseKilometer prüfen kann - die Hilfe soll nicht wieder etwas versprechen, was der Parser
// nicht einlöst (siehe Regression in sport.handler.test.ts).
export const SPORT_HILFE =
    `**Sport-Befehle**\n\n` +
    `**/sport eintragen** – Neue sportliche Aktivität mit Kilometern, Aktivitätsminuten oder beidem eintragen\n` +
    `**/sport loeschen** – Deinen letzten Eintrag löschen\n` +
    `**/sport bearbeiten** – Kilometer und/oder Aktivitätsminuten deines letzten Eintrags korrigieren\n` +
    `**/sport gesamt** – Gesamtkilometer und Aktivitätsminuten aller Sportler\n` +
    `**/sport statistik** – Deine persönliche Übersicht pro Aktivität\n` +
    `**/sport meilenstein setzen** – Einen Meilenstein für die gemeinsame Gesamtdistanz anlegen\n` +
    `**/sport hilfe** – Zeigt diese Übersicht\n\n` +
    `Im Sport-Kanal genügt auch eine normale Nachricht: „+12 km gelaufen", „+45 min Krafttraining" ` +
    `oder „+10 km Radfahren +60 min Krafttraining" werden automatisch eingetragen – erkennbar an der Reaktion ` +
    `${BESTAETIGUNGS_REAKTION} an der Nachricht. Das „+" vor Kilometern und Aktivitätsminuten ist nötig; ` +
    `vergessen? Nachricht einfach bearbeiten, das zählt auch. Jede Sportart geht mit Kilometern oder Minuten; ohne ` +
    `erkennbare Sportart zählen Kilometer als Laufen und Minuten als Krafttraining. Ein ${RUECKFRAGE_REAKTION} heißt: ` +
    `gesehen, aber nicht verstanden – dann die Angabe in „km" oder „min" schreiben.`;

class SportHandler {
    // Auto-Listener: erfasst Kilometer und Aktivitätsminuten aus normalen Chat-Nachrichten - aber NUR im konfigurierten
    // Sport-Kanal (anders als der serverweite Blåhaj-Listener). Serverweit würde jedes beiläufige
    // "noch 3 km bis zum Bahnhof" die gemeinsame Gesamtdistanz verfälschen; zusätzlich muss die
    // Angaben müssen seit 2026-07-14 mit "+" markiert sein (siehe parseKilometer/parseMinuten).
    // Bot-Nachrichten werden ignoriert (die frühere Antwort enthielt "12 km" und hätte sich selbst
    // getriggert - bleibt als Schutz bestehen, falls je wieder geantwortet wird).
    //
    // Bestätigt wird seit 2026-07-14 nur noch per REAKTION auf die Nachricht, nicht mehr mit einer
    // eigenen Antwort im Kanal (User-Wunsch: die Bestätigung soll nicht alle im Kanal behelligen).
    // Eine wirklich private Antwort ist hier technisch unmöglich - ephemere Nachrichten hängen bei
    // Discord an einem Interaction-Token, den eine normale Chat-Nachricht nicht hat. Die Reaktion
    // ist der geräuschloseste Weg, der bleibt; die neue Gesamtdistanz nennt dafür /sport gesamt.
    async handleMessage(message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<void> {
        await this.erfasseSportAusNachricht(message);
    }

    // Auch BEARBEITETE Nachrichten werden erfasst: seit das "+" Pflicht ist, ist "Marker vergessen,
    // Nachricht nachträglich korrigiert" der wahrscheinlichste Weg zum Eintrag.
    //
    // Der Doppel-Eintrag ist hier die eigentliche Gefahr - Discord feuert MessageUpdate bei JEDER
    // Bearbeitung, "+5 km" → "+5 km, war schön" würde die 5 km sonst ein zweites Mal eintragen und
    // die gemeinsame Gesamtdistanz dauerhaft verfälschen. Schutz ist die eigene ✅-Reaktion an der
    // Nachricht (siehe hatBereitsQuittung): hängt sie dran, wurde schon erfasst. Bewusst KEIN
    // zusätzlicher Redis-State - die Quittung, die der Bot ohnehin setzt, ist die Markierung.
    // Bewusst hingenommen: nimmt jemand die Reaktion von Hand weg und bearbeitet erneut, kann er
    // doppelt eintragen. Das muss man absichtlich tun; für einen Community-Bot vertretbar.
    async handleMessageUpdate(message: Message | PartialMessage): Promise<void> {
        // Nicht (mehr) gecachte Nachrichten kommen partial rein - ohne fetch() wären content und
        // reactions leer, die Erfassung würde also nie greifen bzw. die Quittung nicht sehen.
        const vollstaendig = message.partial ? await message.fetch() : message;
        await this.erfasseSportAusNachricht(vollstaendig);
    }

    // Gemeinsamer Kern von handleMessage/handleMessageUpdate.
    // Bot-Nachrichten werden ignoriert (die frühere Antwort enthielt "12 km" und hätte sich selbst
    // getriggert - bleibt als Schutz bestehen, falls je wieder geantwortet wird).
    private async erfasseSportAusNachricht(message: Message): Promise<void> {
        if (message.author.bot) return;

        const kanalId = await sportService.getAnnouncementChannel();
        if (!kanalId || message.channelId !== kanalId) return;

        if (this.hatBereitsQuittung(message)) return;

        const leistungen = erkenneSportLeistungen(message.content);

        if (leistungen.length === 0) {
            if (siehtNachSportAus(message.content) && !this.hatEigeneReaktion(message, RUECKFRAGE_REAKTION)) {
                await message.react(RUECKFRAGE_REAKTION);
            }
            return;
        }

        for (const leistung of leistungen) {
            await sportService.addEntry(
                message.author.id,
                leistung.aktivitaet,
                leistung.kilometer ?? 0,
                leistung.minuten
            );
        }

        try {
            await campHandler.pruefeFortschritt();
        } catch (error) {
            console.error('Fehler bei der Camp-Fortschrittsprüfung:', error);
        }

        await message.react(BESTAETIGUNGS_REAKTION);
        await this.entferneRueckfrage(message);

        if (leistungen.some(leistung => leistung.kilometer !== undefined)) {
            await this.announceReachedMilestones();
        }
    }

    // Hat der Bot diese Nachricht schon quittiert? `me` = "diese Reaktion stammt (auch) von mir" -
    // eine ✅ von einem anderen Mitglied zählt also nicht als Quittung.
    private hatBereitsQuittung(message: Message): boolean {
        return this.hatEigeneReaktion(message, BESTAETIGUNGS_REAKTION);
    }

    private hatEigeneReaktion(message: Message, emoji: string): boolean {
        return message.reactions.cache.get(emoji)?.me === true;
    }

    // Nach erfolgreicher Korrektur soll nicht ✅ UND ❓ an der Nachricht hängen. Fehlertolerant: der
    // Eintrag ist zu diesem Zeitpunkt schon gespeichert und quittiert. users.remove() ohne Argument
    // entfernt die Reaktion des Bots selbst.
    private async entferneRueckfrage(message: Message): Promise<void> {
        if (!this.hatEigeneReaktion(message, RUECKFRAGE_REAKTION)) return;

        try {
            await message.reactions.cache.get(RUECKFRAGE_REAKTION)!.users.remove();
        } catch (error) {
            console.warn('Sport: Rückfrage-Reaktion konnte nicht entfernt werden:', error);
        }
    }

    async handleEintragen(interaction: ChatInputCommandInteraction) {
        const aktivitaet = interaction.options.getString('aktivitaet', true) as SportActivity;
        const kilometer = interaction.options.getNumber('kilometer');
        const minuten = interaction.options.getNumber('minuten');

        if ((kilometer === null || kilometer === 0) &&
            (minuten === null || minuten === 0)) {
            return interaction.reply({
                content: 'Bitte gib Kilometer, Minuten oder beides an.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await sportService.addEntry(
            interaction.user.id,
            aktivitaet,
            kilometer ?? 0,
            minuten ?? undefined
        );

        const aktivitaetLabel = SportActivities[aktivitaet];

        // Direkt nach dem Eintrag die neue gemeinsame Gesamtdistanz zeigen - passt zum
        // kooperativen Design (jeder Eintrag zahlt sichtbar auf die Gruppensumme ein).
        const gesamtKilometer = await sportService.getGesamtKilometer();
        const gesamtMinuten = await sportService.getGesamtMinuten();

        // Persönlicher: der eintragende User steht mit Name + Profilbild oben im Embed. Die Antwort
        // ist seit 2026-07-14 ephemer (User-Wunsch: nur die eintragende Person sieht sie), das Embed
        // bleibt trotzdem - der Meilenstein bleibt der einzige Sport-Post, den alle im Kanal sehen.
        // Die Eintrags-ID braucht seit 2026-07-13 niemand mehr, deshalb kein Footer.

        const leistung = [
            kilometer !== null && kilometer > 0 ? `${kilometer} km` : null,
            minuten !== null ? `${minuten} min` : null,
        ].filter(Boolean).join(' · ');

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setAuthor({
                name: interaction.user.displayName,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .setDescription(
                `${aktivitaetLabel} – **${leistung}**, gemeinsam schon **${rundeKilometer(gesamtKilometer)} km** und **${rundeMinuten(gesamtMinuten)} Aktivitätsminuten**.`
            );

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });

        // Erst nach der Discord-Antwort weitere Benachrichtigungen prüfen,
        // damit die Interaction nicht durch externe Arbeit verzögert wird.
        try {
            await campHandler.pruefeFortschritt();
        } catch (error) {
            console.error('Fehler bei der Camp-Fortschrittsprüfung:', error);
        }

        if (kilometer !== null) {
            await this.announceReachedMilestones();
        }
    }

    async handleLoeschen(interaction: ChatInputCommandInteraction) {
        const entry = await sportService.deleteLastEntry(interaction.user.id);

        if (!entry) {
            return interaction.reply('Du hast keinen Eintrag, den ich löschen könnte.');
        }

        // Nennt Aktivität + Leistung, damit sichtbar ist, was tatsächlich gelöscht wurde.
        const aktivitaetLabel = SportActivities[entry.activity as SportActivity];

        const leistung = [
            entry.kilometers > 0 ? `${entry.kilometers} km` : null,
            entry.minutes !== undefined ? `${entry.minutes} min` : null,
        ].filter(Boolean).join(' · ');

        return interaction.reply(
            `Letzter Eintrag gelöscht: ${aktivitaetLabel} – **${leistung}**.`
        );
    }

    async handleBearbeiten(interaction: ChatInputCommandInteraction) {
        const kilometer = interaction.options.getNumber('kilometer');
        const minuten = interaction.options.getNumber('minuten');

        if (kilometer === null && minuten === null) {
            return interaction.reply({
                content: 'Bitte gib Kilometer, Minuten oder beides an.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const entries = await sportService.getUserEntries(interaction.user.id);
        const letzterEintrag = entries.at(-1);

        if (!letzterEintrag) {
            return interaction.reply(
                'Du hast noch keinen Eintrag, den ich korrigieren könnte.'
            );
        }

        const entry = await sportService.editLastEntry(
            interaction.user.id,
            kilometer ?? undefined,
            minuten ?? undefined
        );

        if (!entry) {
            return interaction.reply(
                'Du hast noch keinen Eintrag, den ich korrigieren könnte.'
            );
        }

        const aktivitaetLabel = SportActivities[entry.activity as SportActivity];

        const leistung = [
            entry.kilometers > 0 ? `${entry.kilometers} km` : null,
            entry.minutes !== undefined ? `${entry.minutes} min` : null,
        ].filter(Boolean).join(' · ');

        await interaction.reply(
            `Letzter Eintrag korrigiert: ${aktivitaetLabel} – jetzt **${leistung}**.`
        );

        // Erst nach der Discord-Antwort weitere Benachrichtigungen prüfen,
        // damit die Interaction nicht durch externe Arbeit verzögert wird.
        try {
            await campHandler.pruefeFortschritt();
        } catch (error) {
            console.error('Fehler bei der Camp-Fortschrittsprüfung:', error);
        }

        if (kilometer !== null) {
            await this.announceReachedMilestones();
        }
    }

    async handleStatistik(interaction: ChatInputCommandInteraction) {
        const entries = await sportService.getUserEntries(interaction.user.id);

        if (!entries.length) {
            return interaction.reply('Du hast noch keine Einträge. Los geht\'s mit `/sport eintragen`!');
        }

        const gesamtKilometer = entries.reduce((sum, e) => sum + e.kilometers, 0);
        const gesamtMinuten = entries.reduce((sum, e) => sum + (e.minutes ?? 0), 0);

        const proAktivitaet = entries.reduce((acc, e) => {
            const bisher = acc[e.activity] ?? { kilometers: 0, minutes: 0 };

            bisher.kilometers += e.kilometers;
            bisher.minutes += e.minutes ?? 0;

            acc[e.activity] = bisher;
            return acc;
        }, {} as Record<string, { kilometers: number; minutes: number }>);

        const aktivitaetsListe = Object.entries(proAktivitaet)
            .sort(([, a], [, b]) => b.kilometers - a.kilometers)
            .map(([key, werte]) => {
                const leistung = [
                    werte.kilometers > 0 ? `${bereinigeKilometer(werte.kilometers)} km` : null,
                    werte.minutes > 0 ? `${rundeMinuten(werte.minutes)} min` : null,
                ].filter(Boolean).join(' · ');

                return `${SportActivities[key as SportActivity]} – ${leistung}`;
            })
            .join('\n');

        return interaction.reply(
            `**Deine Statistik**\n\n` +
            `${aktivitaetsListe}\n\n` +
            `Gesamt: **${bereinigeKilometer(gesamtKilometer)} km** und **${rundeMinuten(gesamtMinuten)} Aktivitätsminuten**`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(SPORT_HILFE);
    }

    async handleGesamt(interaction: ChatInputCommandInteraction) {
        const gesamtKilometer = await sportService.getGesamtKilometer();
        const gesamtMinuten = await sportService.getGesamtMinuten();

        return interaction.reply(
            `Zusammen habt ihr bereits **${rundeKilometer(gesamtKilometer)} km** und **${rundeMinuten(gesamtMinuten)} Aktivitätsminuten** gesammelt!`
        );
    }

    async handleMeilensteinSetzen(interaction: ChatInputCommandInteraction) {
        const kilometer = interaction.options.getNumber('kilometer', true);
        // Wie bei /rollenbutton: literal getipptes \n wird zu echten Zeilenumbrüchen, damit
        // mehrzeilige, formatierte Ankündigungstexte möglich sind (Slash-Eingaben erlauben kein Enter).
        const text = interaction.options.getString('text', true).replaceAll('\\n', '\n');

        await sportService.setMilestone(kilometer, text);

        return interaction.reply(
            `Meilenstein bei **${kilometer} km** gespeichert. ` +
            `Sobald die gemeinsame Gesamtdistanz das erreicht, wird der Text im Ankündigungskanal gepostet.`
        );
    }

    // Postet neu erreichte Meilensteine in den Ankündigungskanal. Bewusst fehlertolerant: darf
    // eine erfolgreich eingetragene Aktivität niemals nachträglich scheitern lassen (daher try/catch).
    // Ohne konfigurierten/abrufbaren Kanal wird NICHT als announced markiert - so wird die Feier
    // nachgeholt, sobald ein Kanal existiert und die Summe erneut steigt.
    // Public, weil die summen-erhöhenden ADMIN-Aktionen seit der /config-Migration nicht mehr hier
    // liegen, sondern in config.settings.ts - die rufen das hier auf (siehe dort).
    async announceReachedMilestones(): Promise<void> {
        try {
            const channel = await ankuendigungskanalService.holeAnkuendigungskanal();
            if (!channel) {
                return;
            }

            const reached = await sportService.checkAndMarkReachedMilestones();
            for (const milestone of reached) {
                try {
                    await channel.send(milestone.text);
                } catch (error) {
                    console.error(`Fehler beim Posten des Sport-Meilensteins (${milestone.kilometers} km):`, error);
                }
            }
        } catch (error) {
            console.error('Fehler beim Prüfen/Posten der Sport-Meilensteine:', error);
        }
    }

    // Beim Start einmal aufrufen: Ist noch nie ein Aktivitätsstand gepostet worden (frischer Deploy),
    // wird der Tagesmarker ohne Post auf heute gesetzt. So kommt die erste Meldung erst zur nächsten
    // Mitternacht statt direkt beim Deploy. Ist der Marker bereits gesetzt (auch von einem früheren
    // Tag), bleibt er unangetastet - die Ausfall-Nachholung in posteTaeglichenAktivitaetsstand greift dann.
    async initTaeglicherPost(): Promise<void> {
        try {
            const letzterTag = await sportService.getLastDailyPostDay();
            if (letzterTag === null) {
                await sportService.setLastDailyPostDay(formatTag(new Date()));
            }
        } catch (error) {
            console.error('Fehler beim Initialisieren des täglichen Aktivitätsstand-Posts:', error);
        }
    }

    // Postet den gemeinsamen Aktivitätsstand einmal pro Tag in den Ankündigungskanal. Idempotent über
    // den Tagesmarker: heute schon gepostet -> nichts. War der Bot um Mitternacht aus, wird beim ersten
    // Lauf des neuen Tages nachgeholt. Der Marker wird NUR nach erfolgreichem Post gesetzt - ohne
    // abrufbaren Kanal bleibt er stehen, damit die Meldung nachgeholt wird, sobald ein Kanal existiert.
    // Bewusst fehlertolerant (wie die Meilenstein-Ankündigung).
    async posteTaeglichenAktivitaetsstand(): Promise<void> {
        try {
            const heute = formatTag(new Date());
            const letzterTag = await sportService.getLastDailyPostDay();
            if (letzterTag === heute) {
                return;
            }

            const channel = await ankuendigungskanalService.holeAnkuendigungskanal();
            if (!channel) {
                return;
            }

            const gesamtKilometer = await sportService.getGesamtKilometer();
            const gesamtMinuten = await sportService.getGesamtMinuten();

            await channel.send(
                `Aktivitätsstand um Mitternacht: gemeinsam **${rundeKilometer(gesamtKilometer)} km** und **${rundeMinuten(gesamtMinuten)} Aktivitätsminuten**.`
            );

            await sportService.setLastDailyPostDay(heute);
        } catch (error) {
            console.error('Fehler beim Posten des täglichen Aktivitätsstands:', error);
        }
    }
}

export default new SportHandler();
