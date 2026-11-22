import client from '../client.js';
import redisService from './redis.service.js';
import twitchUserService from './twitch.user.service.js';
import sportService from './sport.service.js';
import loggingService from './logging.service.js';
import greetingService from './greeting.service.js';
import geburtstagService from './geburtstag.service.js';
import drachenService from './drachen.service.js';

// Gesundheit des Bots, für den Endpunkt /config/gesundheit (den uptime.yml abfragt) und /diagnose.
// Anlass war der 2026-11-22: Redis lief mit `save ""`, ein Neustart des Hosts löschte die komplette
// Datenbank, und der Bot lief danach scheinbar gesund weiter. Gemerkt hat es erst ein Mensch, der
// /diagnose aufrief. Siehe docs/betrieb.md.
// client wird nur in Funktionskörpern benutzt (Zirkular-Import-Falle, siehe CLAUDE.md).

export interface Persistenz {
    // Inhalt von `save`, leer heißt: Redis schreibt nie auf Platte.
    regeln: string;
    letzteSicherung: Date | null;
    letzteSicherungOk: boolean;
}

// INFO liefert Zeilen "schluessel:wert", dazwischen Überschriften ("# Persistence") und Leerzeilen.
export function parseInfo(text: string): Record<string, string> {
    const werte: Record<string, string> = {};
    for (const zeile of text.split(/\r?\n/)) {
        const trenner = zeile.indexOf(':');
        if (trenner <= 0 || zeile.startsWith('#')) continue;
        werte[zeile.slice(0, trenner)] = zeile.slice(trenner + 1).trim();
    }
    return werte;
}

export async function holePersistenz(): Promise<Persistenz> {
    const regeln = (await redisService.getConfigWert('save'))?.trim() ?? '';
    const info = parseInfo(await redisService.getInfo('persistence'));
    const sekunden = Number(info.rdb_last_save_time);
    return {
        regeln,
        letzteSicherung: Number.isFinite(sekunden) && sekunden > 0 ? new Date(sekunden * 1000) : null,
        letzteSicherungOk: info.rdb_last_bgsave_status === 'ok',
    };
}

// Eine leere Datenbank erkennt man an den Kanälen: die setzt nur ein Admin, der Bot legt sie nie von
// selbst an. Die Zahl der Schlüssel taugt dafür nicht, nach dem Neustart am 2026-11-22 hatte der Bot
// binnen zwei Stunden wieder 254 Schlüssel geschrieben (Nutzer-Cache, Ping-Pong).
async function einstellungenVorhanden(): Promise<boolean> {
    const kanaele = await Promise.all([
        twitchUserService.getNotificationChannel(),
        sportService.getAnnouncementChannel(),
        loggingService.getLogChannel(),
        greetingService.getChannel(),
        geburtstagService.getChannel(),
        drachenService.getChannel(),
    ]);
    return kanaele.some(kanal => kanal !== null);
}

// Liefert die gefundenen Probleme, leer heißt gesund. Die Texte gehen über einen öffentlichen
// Endpunkt raus und nennen deshalb nur den Befund, keine IDs oder Inhalte.
export async function pruefeGesundheit(): Promise<string[]> {
    const probleme: string[] = [];
    if (!client.isReady()) {
        probleme.push('Discord-Verbindung nicht bereit');
    }
    if (!redisService.verbunden) {
        probleme.push('Redis nicht verbunden');
        return probleme;
    }

    try {
        if (!await einstellungenVorhanden()) {
            probleme.push('Keine Kanal-Einstellung gesetzt, Datenbank leer?');
        }
        const persistenz = await holePersistenz();
        if (!persistenz.regeln) {
            probleme.push('Redis speichert nicht auf Platte (save ist leer)');
        }
        if (!persistenz.letzteSicherungOk) {
            probleme.push('Letzte Redis-Sicherung fehlgeschlagen');
        }
    } catch (error) {
        console.error('Gesundheitsprüfung: Redis-Abfrage fehlgeschlagen:', error);
        probleme.push('Redis-Abfrage fehlgeschlagen');
    }
    return probleme;
}
