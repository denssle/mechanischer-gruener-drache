import redisService from './redis.service.js';

// Wie oft ist dieselbe Person dem Server schon beigetreten? Wer geht und wiederkommt, zählt
// hoch. Bewusst dauerhaft (kein TTL) - der Witz an der Zahl ist ja gerade, dass sie über
// Jahre stehen bleibt. Discord selbst merkt sich das nicht.
const KEYS = {
    joinCount: (userId: string) => `MEMBER:JOIN_COUNT:${userId}`,
};

class MemberService {
    // Zählt den Beitritt und gibt den neuen Stand zurück (1 = erster Beitritt).
    // Hochzählen und Lesen in einem Redis-Befehl, damit sich kein paralleler Event-Handler
    // dazwischenschieben kann.
    async zaehleBeitritt(userId: string): Promise<number> {
        return redisService.increment(KEYS.joinCount(userId));
    }

    async getBeitrittsAnzahl(userId: string): Promise<number> {
        const wert = await redisService.get(KEYS.joinCount(userId));
        return wert ? Number(wert) : 0;
    }
}

export default new MemberService();
