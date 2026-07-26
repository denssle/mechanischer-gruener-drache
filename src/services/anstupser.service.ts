import redisService from './redis.service.js';

// Abo-Verwaltung für den täglichen 13:37-Anstupser. Gespeichert werden NUR Discord-User-IDs
// (Set = jede Person höchstens einmal drin, An-/Abmelden sind damit von sich aus idempotent).
// Dokumentiert in docs/datenhaltung.md.
const KEYS = {
    abos: 'ANSTUPSER:ABOS',
    // Tagesmarker (YYYY-MM-DD) der zuletzt verschickten Runde - Schutz gegen mehrfaches Versenden,
    // weil der Minuten-Timer innerhalb derselben Minute mehrfach anschlagen könnte.
    lastDay: 'ANSTUPSER:LAST_DAY',
};

class AnstupserService {
    async abonniere(userId: string): Promise<void> {
        await redisService.addToSet(KEYS.abos, userId);
    }

    async kuendige(userId: string): Promise<void> {
        await redisService.removeFromSet(KEYS.abos, userId);
    }

    async istAbonniert(userId: string): Promise<boolean> {
        return redisService.isSetMember(KEYS.abos, userId);
    }

    async holeAbonnenten(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.abos);
    }

    async getLastSentDay(): Promise<string | null> {
        return redisService.get(KEYS.lastDay);
    }

    async setLastSentDay(day: string): Promise<void> {
        await redisService.set(KEYS.lastDay, day);
    }
}

export default new AnstupserService();
