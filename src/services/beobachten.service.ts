import redisService from './redis.service.js';

// Beobachtungslisten für LotGD-Charaktere: wer will, hinterlegt Namen und bekommt eine DM,
// sobald einer davon im Spiel online geht. Pro Person eine eigene Liste (kein serverweiter
// Aushang), Zustellung per DM - dieselbe Opt-in-Linie wie beim Anstupser-Abo.
// Alle Keys sind in docs/datenhaltung.md dokumentiert.
const KEYS = {
    // Die Namen, die eine Person beobachtet (Set = jeder Name höchstens einmal).
    liste: (userId: string) => `WATCH:LISTE:${userId}`,
    // Wer überhaupt eine Liste hat. Ohne dieses Set müsste der Poller die Redis-Keys scannen -
    // dasselbe Muster wie CHARACTER:ALL_LINKS.
    beobachter: 'WATCH:BEOBACHTER',
    // Übergangs-State: welche beobachteten Namen waren beim letzten Poll eingeloggt. Ohne den
    // würde jeder Durchlauf dieselben Leute erneut melden.
    online: 'WATCH:ONLINE',
    // Meldesperre pro Person+Name (TTL). Fällt jemand kurz aus der Liste und kommt wieder,
    // wäre das sonst eine zweite Meldung für dieselbe Sitzung.
    sperre: (userId: string, name: string) => `WATCH:GEMELDET:${userId}:${name.toLowerCase()}`,
};

// Höchstens so viele Namen pro Person - sonst abonniert jemand die halbe Kriegerliste und
// bekommt beim Tageswechsel ein Dutzend DMs am Stück.
export const MAX_NAMEN = 10;

// Wie lange nach einer Meldung für denselben Namen Ruhe ist (Sekunden).
export const SPERRE_SEKUNDEN = 60 * 60;

class BeobachtenService {
    async fuegeHinzu(userId: string, name: string): Promise<void> {
        await redisService.addToSet(KEYS.liste(userId), name);
        await redisService.addToSet(KEYS.beobachter, userId);
    }

    // Entfernt den Namen und räumt die Person aus dem Beobachter-Set, wenn ihre Liste leer ist -
    // sonst liefe der Poller dauerhaft über Karteileichen.
    async entferne(userId: string, name: string): Promise<void> {
        await redisService.removeFromSet(KEYS.liste(userId), name);
        if ((await this.holeListe(userId)).length === 0) {
            await redisService.removeFromSet(KEYS.beobachter, userId);
        }
    }

    async holeListe(userId: string): Promise<string[]> {
        return redisService.getSetMembers(KEYS.liste(userId));
    }

    async holeBeobachter(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.beobachter);
    }

    // Namen, die beim letzten Poll online waren.
    async holeZuletztOnline(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.online);
    }

    async setzeZuletztOnline(namen: string[]): Promise<void> {
        await redisService.delete(KEYS.online);
        for (const name of namen) {
            await redisService.addToSet(KEYS.online, name);
        }
    }

    // true, wenn für diese Person+Namen gerade eine Meldesperre läuft.
    async istGesperrt(userId: string, name: string): Promise<boolean> {
        return await redisService.getTimeToLive(KEYS.sperre(userId, name)) > 0;
    }

    async sperre(userId: string, name: string): Promise<void> {
        await redisService.setWithExpiry(KEYS.sperre(userId, name), '1', SPERRE_SEKUNDEN);
    }
}

export default new BeobachtenService();
