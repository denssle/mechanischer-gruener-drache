import redisService from './redis.service.js';
import {TIPPS, Tipp} from '../data/tipps.js';
import {NETTIGKEITEN} from '../data/nettigkeiten.js';

// Die beiden Listen liegen als reine Daten in src/data/ (die Nettigkeiten sind ~100 Zeilen
// lang und würden die Logik hier sonst begraben). Re-Export, damit Aufrufer/Tests nur diesen
// Service kennen müssen.
export {TIPPS, NETTIGKEITEN};
export type {Tipp};

// Gelegentliche Tipps + kleine Nettigkeiten, die an eine ohnehin ausgelöste Bot-Antwort
// gehängt werden (ephemer, siehe interaction.handler.ts) - damit Leute Befehle entdecken,
// ohne dass jemand /hilfe aufrufen muss. Bewusst stark gedrosselt: der Bot soll niemanden
// belehren und im Channel gar nicht erst zusätzlich auffallen.
const CHANCE = 0.15;              // nur ~jede 7. Interaktion trägt überhaupt eine Zeile
const COOLDOWN_SECONDS = 86400;   // und pro Person höchstens eine am Tag
const NETTIGKEIT_CHANCE = 0.3;    // davon ist rund jede dritte Zeile ein Tipp-freier Gruß

const KEYS = {
    cooldown: (userId: string) => `TIPP:COOLDOWN:${userId}`,
    benutzteBefehle: (userId: string) => `TIPP:USED_COMMANDS:${userId}`,
};

// Bei /hilfe und /spielwelt weiß die Person gerade selbst, wo die Befehle stehen -
// ein Tipp wäre dort nur redundant.
const AUSGENOMMENE_COMMANDS = ['hilfe', 'spielwelt'];

// Nur Tipps zu Befehlen, die die Person noch nie benutzt hat - wer /sport täglich nutzt,
// braucht keine Erklärung mehr dazu. null, wenn alle Tipp-Befehle schon bekannt sind.
export function randomTipp(benutzteBefehle: string[] = []): string | null {
    const offen = TIPPS.filter((tipp) => !benutzteBefehle.includes(tipp.befehl));
    if (offen.length === 0) {
        return null;
    }
    return offen[Math.floor(Math.random() * offen.length)].text;
}

export function randomNettigkeit(): string {
    return NETTIGKEITEN[Math.floor(Math.random() * NETTIGKEITEN.length)];
}

// Entscheidet allein anhand des Kontexts, ob eine Zeile überhaupt in Frage kommt -
// bewusst ohne Redis/Zufall, damit die Regeln testbar und offensichtlich bleiben.
// Ephemere Antworten sind genau die Fehlermeldungen, Cooldown-Abfuhren und
// Admin-Quittungen: da löst gerade jemand ein Problem und will kein Tutorial.
export function kommtTippInFrage(commandName: string, warEphemer: boolean): boolean {
    if (warEphemer) return false;
    return !AUSGENOMMENE_COMMANDS.includes(commandName);
}

class TippService {
    // Merkt sich dauerhaft, welche Befehle die Person schon benutzt hat (nur die Namen,
    // keine Argumente/Inhalte - siehe docs/datenhaltung.md). Basis für "nur Tipps zu
    // noch unbekannten Befehlen"; wird bei jeder Command-Ausführung aufgerufen.
    async merkeBenutztenBefehl(userId: string, commandName: string): Promise<void> {
        await redisService.addToSet(KEYS.benutzteBefehle(userId), commandName);
    }

    // Liefert eine Zeile - oder null, wenn diesmal (bewusst) keine kommt: entweder weil der
    // Würfel dagegen war oder weil die Person heute schon eine bekommen hat.
    async holeZeileFuerUser(userId: string): Promise<string | null> {
        if (Math.random() >= CHANCE) {
            return null;
        }

        const verbleibend = await redisService.getTimeToLive(KEYS.cooldown(userId));
        if (verbleibend > 0) {
            return null;
        }

        await redisService.setWithExpiry(KEYS.cooldown(userId), '1', COOLDOWN_SECONDS);

        if (Math.random() < NETTIGKEIT_CHANCE) {
            return randomNettigkeit();
        }

        // Kennt die Person bereits alle Befehle, zu denen es Tipps gibt, kommt stattdessen
        // eine Nettigkeit - niemandem etwas erklären, das er längst benutzt.
        const benutzteBefehle = await redisService.getSetMembers(KEYS.benutzteBefehle(userId));
        return randomTipp(benutzteBefehle) ?? randomNettigkeit();
    }
}

export default new TippService();
