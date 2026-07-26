import {format} from 'util';
import config from '../../config.json' with {type: 'json'};

// In-Memory-Ringpuffer der letzten Log-Zeilen, damit ein Admin sie auf /config einsehen kann, ohne
// per SSH ins Supervisor-Log zu schauen (README-Todo). Bewusst KEINE Datei/kein Redis: der Zweck ist
// "Bot laeuft, aber irgendwas kommt nicht an" - dann hat der laufende Prozess die relevanten Zeilen im
// RAM. Crasht der Bot, ist /config ohnehin nicht erreichbar (dann bleibt der Dateiweg per SSH).

export type LogLevel = 'log' | 'warn' | 'error';

export interface LogEntry {
    zeit: number;   // ms seit Epoche
    level: LogLevel;
    text: string;
}

// Fuer einen kleinen Privatserver reichlich; jede Zeile ist nur ein kurzer String.
export const MAX_ENTRIES = 500;

const puffer: LogEntry[] = [];

// Secret-Werte aus der config.json, die niemals im Log-Klartext landen duerfen (falls sie doch mal in
// eine Fehlermeldung geraten). Nur ausreichend lange Werte, sonst wuerde ein kurzer Dummy-Wert (CI:
// BOT_TOKEN="test") halbe Woerter im Text schwaerzen. Optionale Felder per Cast (Muster twitch.service).
const c = config as {
    BOT_TOKEN?: string;
    TWITCH_CLIENT_SECRET?: string;
    TWITCH_WEBHOOK_SECRET?: string;
    DISCORD_CLIENT_SECRET?: string;
    CONFIG_SESSION_SECRET?: string;
};
const SECRETS: string[] = [
    c.BOT_TOKEN,
    c.TWITCH_CLIENT_SECRET,
    c.TWITCH_WEBHOOK_SECRET,
    c.DISCORD_CLIENT_SECRET,
    c.CONFIG_SESSION_SECRET,
].filter((wert): wert is string => typeof wert === 'string' && wert.length >= 8);

// Bekannte Geheimnisse im Text durch *** ersetzen - reine Vorsichtsmassnahme, unsere eigenen
// console.*-Aufrufe loggen keine Secrets, aber ein fremder Stacktrace koennte theoretisch einen tragen.
export function redigiere(text: string): string {
    let ergebnis = text;
    for (const secret of SECRETS) {
        ergebnis = ergebnis.split(secret).join('***');
    }
    return ergebnis;
}

function merke(level: LogLevel, args: unknown[]): void {
    puffer.push({zeit: Date.now(), level, text: redigiere(format(...args))});
    if (puffer.length > MAX_ENTRIES) {
        puffer.shift();
    }
}

let installiert = false;

// console.log/warn/error abfangen: der Ringpuffer bekommt eine Kopie, die Ausgabe geht unveraendert
// weiter (der Hoster persistiert sie wie bisher). Idempotent - ein zweiter Aufruf tut nichts.
export function installLogCapture(): void {
    if (installiert) {
        return;
    }
    installiert = true;
    const original = {log: console.log, warn: console.warn, error: console.error};
    console.log = (...args: unknown[]) => {
        merke('log', args);
        original.log(...args);
    };
    console.warn = (...args: unknown[]) => {
        merke('warn', args);
        original.warn(...args);
    };
    console.error = (...args: unknown[]) => {
        merke('error', args);
        original.error(...args);
    };
}

// Kopie der gepufferten Zeilen (aelteste zuerst), damit Aufrufer den Puffer nicht versehentlich mutieren.
export function getLogEntries(): LogEntry[] {
    return [...puffer];
}

// Nur fuer Tests: Puffer leeren.
export function clearLogBuffer(): void {
    puffer.length = 0;
}
