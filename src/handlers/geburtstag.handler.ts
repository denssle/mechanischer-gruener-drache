import {ChatInputCommandInteraction, MessageFlags, TextChannel} from 'discord.js';
import client from '../client.js';
import config from '../../config.json' with {type: 'json'};
import geburtstagService, {Geburtstag} from '../services/geburtstag.service.js';
import {ALTERS_ZEILEN, GEBURTSTAGS_GLUECKWUENSCHE} from '../data/geburtstagsglueckwuensche.js';

// Geburtstagskalender: jede:r trägt den eigenen Geburtstag selbst ein (Jahr optional), der Bot
// gratuliert am Tag im konfigurierten Kanal (gesetzt über /config). Angestoßen vom EINEN 60-s-Timer
// in index.ts - derselbe Mechanismus wie Mitternachts-Kilometerstand und Anstupser, keine Cron-Dependency.
//
// client wird nur in Methodenkörpern benutzt, nie auf Modul-Top-Level: der Handler ist über
// commands/index.js erreichbar, sonst greift die Zirkular-Import-Falle (siehe CLAUDE.md).

// Uhrzeit der täglichen Runde (lokale Host-Zeit = Europe/Berlin). Bewusst morgens statt um
// Mitternacht: ein Glückwunsch um 00:00 geht im Nichts unter, um 8 Uhr liest ihn jemand.
export const GRATULATIONS_STUNDE = 8;

const MONATSNAMEN = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Februar mit 29 Tagen: ohne Jahr ist der 29.02. ein völlig gültiger Geburtstag (siehe
// gratulationsDatum für den Umgang mit Nicht-Schaltjahren).
const TAGE_IM_MONAT = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Wie weit zurück ein Geburtsjahr liegen darf. Reine Plausibilitätsgrenze gegen Vertipper.
export const FRUEHESTES_JAHR = 1900;

// Der Bot hat selbst Geburtstag: der erste Commit ("Init") ist vom 11.06.2026. Fest verdrahtet
// statt im Redis-Hash - er trägt sich nicht selbst ein, und ein Eintrag, den niemand über
// /geburtstag entfernen kann, gehört nicht in die Datenhaltung (siehe docs/datenhaltung.md).
export const BOT_GEBURTSTAG: Geburtstag = {tag: 11, monat: 6, jahr: 2026};

// Prüft Tag/Monat (und, falls angegeben, das Jahr) auf Plausibilität. Ohne Jahr ist der 29.02.
// erlaubt; MIT Jahr wird gegen das echte Datum geprüft, damit "29.02.1995" (kein Schaltjahr) auffällt.
export function istGueltigesDatum(tag: number, monat: number, jahr: number | null): boolean {
    if (!Number.isInteger(tag) || !Number.isInteger(monat) || monat < 1 || monat > 12) {
        return false;
    }
    if (tag < 1 || tag > TAGE_IM_MONAT[monat - 1]) {
        return false;
    }
    if (jahr === null) {
        return true;
    }
    if (!Number.isInteger(jahr) || jahr < FRUEHESTES_JAHR || jahr > new Date().getFullYear()) {
        return false;
    }
    // Round-Trip-Check wie bei parseGermanDateTime: new Date() normalisiert den 29.02. eines
    // Nicht-Schaltjahres still auf den 01.03., das wäre stillschweigend ein anderes Datum.
    const datum = new Date(jahr, monat - 1, tag);
    return datum.getFullYear() === jahr && datum.getMonth() === monat - 1 && datum.getDate() === tag;
}

// An welchem Tag im gegebenen Jahr gratuliert wird. Der einzige Sonderfall ist der 29.02.: in einem
// Nicht-Schaltjahr wird am 01.03. gratuliert - dieselbe Regel, die auch das BGB (§ 188 Abs. 3) für
// Fristen an einem fehlenden Monatstag anwendet. Rein + getestet, weil sowohl der tägliche Post als
// auch die Sortierung der Liste davon abhängen.
export function gratulationsDatum(jahr: number, geburtstag: Geburtstag): Date {
    const datum = new Date(jahr, geburtstag.monat - 1, geburtstag.tag);
    // new Date(jahr, 1, 29) rollt in einem Nicht-Schaltjahr von selbst auf den 01.03. weiter -
    // genau das gewünschte Verhalten, hier nur explizit festgehalten.
    return datum;
}

// Hat die Person am angegebenen Tag Geburtstag?
export function istHeuteGeburtstag(geburtstag: Geburtstag, heute: Date): boolean {
    const ziel = gratulationsDatum(heute.getFullYear(), geburtstag);
    return ziel.getMonth() === heute.getMonth() && ziel.getDate() === heute.getDate();
}

// Alter am Stichtag, oder null ohne hinterlegtes Jahr. Zählt das laufende Jahr nur mit, wenn der
// Geburtstag dieses Jahr schon war - sonst wäre die Zahl bis zum Geburtstag um eins zu hoch.
export function berechneAlter(geburtstag: Geburtstag, stichtag: Date): number | null {
    if (geburtstag.jahr === null) {
        return null;
    }
    const diesesJahr = gratulationsDatum(stichtag.getFullYear(), geburtstag);
    const schonGewesen = stichtag.getMonth() > diesesJahr.getMonth()
        || (stichtag.getMonth() === diesesJahr.getMonth() && stichtag.getDate() >= diesesJahr.getDate());
    return stichtag.getFullYear() - geburtstag.jahr - (schonGewesen ? 0 : 1);
}

// Nächstes Vorkommen ab dem Stichtag (heute zählt mit) - Sortierschlüssel für die Kalender-Liste.
export function naechstesVorkommen(geburtstag: Geburtstag, stichtag: Date): Date {
    const diesesJahr = gratulationsDatum(stichtag.getFullYear(), geburtstag);
    const heute = new Date(stichtag.getFullYear(), stichtag.getMonth(), stichtag.getDate());
    return diesesJahr >= heute ? diesesJahr : gratulationsDatum(stichtag.getFullYear() + 1, geburtstag);
}

// Anzeigeform: "29. Februar" bzw. "29. Februar 1996".
export function formatDatum(geburtstag: Geburtstag): string {
    const datum = `${geburtstag.tag}. ${MONATSNAMEN[geburtstag.monat - 1]}`;
    return geburtstag.jahr === null ? datum : `${datum} ${geburtstag.jahr}`;
}

// Baut den Glückwunsch: eine zufällige Zeile aus der Liste, dazu - nur wenn ein Jahr hinterlegt ist -
// eine zufällige Alterszeile. Exportiert + getestet; der Zufall macht die Funktion nicht deterministisch,
// deshalb prüfen die Tests die Bestandteile (Name eingesetzt, Alter genannt/weggelassen).
export function waehleGlueckwunsch(name: string, alter: number | null): string {
    const glueckwunsch = GEBURTSTAGS_GLUECKWUENSCHE[
        Math.floor(Math.random() * GEBURTSTAGS_GLUECKWUENSCHE.length)
        ].replaceAll('{name}', name);
    if (alter === null) {
        return glueckwunsch;
    }
    const alterszeile = ALTERS_ZEILEN[
        Math.floor(Math.random() * ALTERS_ZEILEN.length)
        ].replaceAll('{alter}', String(alter));
    return `${glueckwunsch} ${alterszeile}`;
}

export const GEBURTSTAG_HILFE =
    `**Geburtstags-Befehle**\n\n` +
    `**/geburtstag setzen** – Deinen Geburtstag hinterlegen (Jahr optional)\n` +
    `**/geburtstag entfernen** – Deinen Eintrag wieder löschen\n` +
    `**/geburtstag status** – Zeigt, was ich zu dir gespeichert habe\n` +
    `**/geburtstag liste** – Die nächsten anstehenden Geburtstage\n` +
    `**/geburtstag hilfe** – Zeigt diese Übersicht\n\n` +
    `Am Tag selbst gratuliere ich im Geburtstagskanal. Das **Jahr ist freiwillig** – gibst du es an, ` +
    `nenne ich beim Gratulieren auch das Alter; ohne Jahr eben nicht. Alles nur, wenn du dich selbst einträgst.`;

// Die Liste ist nach dem nächsten Termin sortiert, am Limit fallen also die fernsten Geburtstage weg.
const MAX_LISTEN_LAENGE = 1900;

export function baueGeburtstagsliste(zeilen: string[]): string {
    const kopf = '**Die nächsten Geburtstage:**';
    const passend: string[] = [];
    let laenge = kopf.length;
    for (const zeile of zeilen) {
        if (laenge + zeile.length + 1 > MAX_LISTEN_LAENGE) break;
        passend.push(zeile);
        laenge += zeile.length + 1;
    }
    const rest = zeilen.length - passend.length;
    return [kopf, ...passend, ...(rest > 0 ? [`… und ${rest} weitere.`] : [])].join('\n');
}

// Die anzuzeigenden Einträge: die hinterlegten - aber nur von aktuellen Mitgliedern, ein Eintrag
// ohne Mitglied wäre eine tote Erwähnung - plus der fest verdrahtete Bot-Geburtstag. Der Bot steht
// bewusst nicht unter dem Mitglieder-Filter: er ist immer auf dem Server, und ein leerer
// members.cache soll ihn nicht verschlucken. Ein (theoretisch) gespeicherter Eintrag unter seiner
// ID wird vom festen überschrieben.
function sammleEintraege(alle: Record<string, Geburtstag>, mitglied: (userId: string) => boolean): [string, Geburtstag][] {
    const botId = client.user?.id;
    const eintraege = Object.entries(alle)
        .filter(([userId]) => userId !== botId && mitglied(userId));
    return botId ? [...eintraege, [botId, BOT_GEBURTSTAG]] : eintraege;
}

class GeburtstagHandler {
    async handleSetzen(interaction: ChatInputCommandInteraction) {
        const tag = interaction.options.getInteger('tag', true);
        const monat = interaction.options.getInteger('monat', true);
        const jahr = interaction.options.getInteger('jahr');

        if (!istGueltigesDatum(tag, monat, jahr)) {
            return interaction.reply({
                content: `Das Datum kann ich nicht annehmen. Tag und Monat müssen zusammenpassen ` +
                    `(kein 31. Februar), und ein Geburtsjahr muss zwischen ${FRUEHESTES_JAHR} und ` +
                    `heute liegen.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const geburtstag: Geburtstag = {tag, monat, jahr};
        await geburtstagService.setGeburtstag(interaction.user.id, geburtstag);

        const alterHinweis = jahr === null
            ? 'Ohne Jahr – ich nenne beim Gratulieren also kein Alter.'
            : 'Mit Jahr – beim Gratulieren nenne ich also auch dein Alter.';
        return interaction.reply({
            content: `Notiert: **${formatDatum(geburtstag)}**. ${alterHinweis}\n` +
                `Mit \`/geburtstag entfernen\` nimmst du den Eintrag wieder zurück.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        if (!(await geburtstagService.getGeburtstag(interaction.user.id))) {
            return interaction.reply({
                content: 'Ich habe gar keinen Geburtstag von dir gespeichert.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await geburtstagService.entferneGeburtstag(interaction.user.id);
        return interaction.reply({
            content: 'Eintrag gelöscht. Ich gratuliere dir nicht mehr.',
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleStatus(interaction: ChatInputCommandInteraction) {
        const geburtstag = await geburtstagService.getGeburtstag(interaction.user.id);
        return interaction.reply({
            content: geburtstag
                ? `Gespeichert: **${formatDatum(geburtstag)}**.`
                : 'Du hast keinen Geburtstag hinterlegt. Mit `/geburtstag setzen` trägst du dich ein.',
            flags: MessageFlags.Ephemeral,
        });
    }

    // Öffentlich, damit man sieht, wer als Nächstes dran ist. Erwähnungen ohne Ping (wie
    // /rollenspiel suchende) - hier soll niemand angestupst werden, das ist dem Glückwunsch vorbehalten.
    async handleListe(interaction: ChatInputCommandInteraction) {
        const alle = await geburtstagService.getAlle();
        const heute = new Date();

        // Nur Leute, die noch auf dem Server sind - ein Eintrag ohne Mitglied wäre eine tote Erwähnung.
        const guild = client.guilds.cache.get(config.GUILD_ID);
        const eintraege = sammleEintraege(alle, (userId) => !!guild?.members.cache.has(userId))
            .map(([userId, geburtstag]) => ({userId, geburtstag, naechster: naechstesVorkommen(geburtstag, heute)}))
            .sort((a, b) => a.naechster.getTime() - b.naechster.getTime());

        // Praktisch unerreichbar, seit der Bot selbst mitgeführt wird (nur vor dem Login, wenn
        // client.user noch fehlt) - bleibt als Absicherung stehen statt einer leeren Überschrift.
        if (!eintraege.length) {
            return interaction.reply('Es hat noch niemand einen Geburtstag hinterlegt. Mit `/geburtstag setzen` fängst du an.');
        }

        // Ohne Jahr: die Liste ist öffentlich, das Geburtsjahr sieht die Person nur selbst
        // (/geburtstag status). Es ist freiwillig und hilft hier niemandem.
        const zeilen = eintraege.map(({userId, geburtstag}) =>
            `- <@${userId}> – ${formatDatum({...geburtstag, jahr: null})}`);

        return interaction.reply({
            content: baueGeburtstagsliste(zeilen),
            allowedMentions: {parse: []},
        });
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(GEBURTSTAG_HILFE);
    }

    // Wird vom 60-s-Timer in index.ts angestupst und entscheidet selbst, ob etwas zu tun ist.
    // Zeitprüfung (ab GRATULATIONS_STUNDE) + Tagesmarker: dadurch kommt der Glückwunsch morgens um 8
    // bzw. beim ersten Lauf danach, wenn der Bot zu der Zeit aus war - aber NIE für einen vergangenen
    // Tag (ein "alles Gute" von gestern ist keins mehr). Bewusst fehlertolerant wie die anderen
    // Timer-Aufgaben: ein Fehler hier darf den Bot nicht mitreißen.
    async posteGeburtstagsgruesse(): Promise<void> {
        try {
            const jetzt = new Date();
            if (jetzt.getHours() < GRATULATIONS_STUNDE) {
                return;
            }

            const heute = formatTag(jetzt);
            if (await geburtstagService.getLastPostDay() === heute) {
                return;
            }

            const alle = await geburtstagService.getAlle();
            const guild = client.guilds.cache.get(config.GUILD_ID);
            const heutige = sammleEintraege(alle, (userId) => !!guild?.members.cache.has(userId))
                .filter(([, geburtstag]) => istHeuteGeburtstag(geburtstag, jetzt));

            // Niemand hat heute Geburtstag: Tag abhaken, damit die Prüfung nicht jede Minute erneut
            // durch alle Einträge läuft. Der Kanal wird dafür bewusst nicht gebraucht.
            if (!heutige.length) {
                await geburtstagService.setLastPostDay(heute);
                return;
            }

            const channel = await this.holeKanal();
            if (!channel) {
                // Marker NICHT setzen (wie beim Kilometerstand-Post): sobald ein Kanal existiert,
                // wird der Glückwunsch heute noch nachgeholt.
                return;
            }

            for (const [userId, geburtstag] of heutige) {
                try {
                    // Die Erwähnung DARF pingen - das ist der Sinn eines Glückwunschs (anders als
                    // bei /geburtstag liste, wo allowedMentions bewusst leer ist). Als Allowlist
                    // auf genau diese Person: der Glückwunsch soll das Geburtstagskind erreichen
                    // und sonst niemanden, egal was künftig in die Textbausteine wandert.
                    await channel.send({
                        content: waehleGlueckwunsch(`<@${userId}>`, berechneAlter(geburtstag, jetzt)),
                        allowedMentions: {users: [userId]},
                    });
                } catch (error) {
                    console.error(`Fehler beim Posten des Geburtstagsgrußes für ${userId}:`, error);
                }
            }

            await geburtstagService.setLastPostDay(heute);
        } catch (error) {
            console.error('Fehler beim Posten der Geburtstagsgrüße:', error);
        }
    }

    // Konfigurierter Geburtstagskanal oder null (nicht gesetzt bzw. nicht abrufbar) - Muster wie
    // ankuendigungskanal.service, inklusive lautem Log statt stillem return.
    private async holeKanal(): Promise<TextChannel | null> {
        const channelId = await geburtstagService.getChannel();
        if (!channelId) {
            console.warn('Kein Geburtstagskanal gesetzt - Glückwunsch wird zurückgestellt.');
            return null;
        }

        const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
        if (!channel) {
            console.warn(`Geburtstagskanal ${channelId} nicht abrufbar - Glückwunsch wird zurückgestellt.`);
            return null;
        }
        return channel;
    }
}

// Lokales Datum als YYYY-MM-DD (Host läuft auf Europe/Berlin) - Tagesmarker wie bei Sport/Anstupser.
function formatTag(date: Date): string {
    const jahr = date.getFullYear();
    const monat = String(date.getMonth() + 1).padStart(2, '0');
    const tag = String(date.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
}

export default new GeburtstagHandler();
