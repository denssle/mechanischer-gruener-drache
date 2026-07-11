import redisService from './redis.service.js';

const KEYS = {
    channel: 'LOGGING:CHANNEL',
    message: (messageId: string) => `LOGGING:MESSAGE:${messageId}`,
};

// Nachrichteninhalte werden nur so lange vorgehalten, wie sie fürs Log gebraucht werden
// (nachvollziehen, was gerade gelöscht/bearbeitet wurde) - kein Dauer-Archiv. Redis räumt per TTL auf.
export const MESSAGE_CACHE_SECONDS = 7 * 24 * 60 * 60;

// Was wir uns von einer Nachricht merken: Text + Dateinamen der Anhänge (nicht die Dateien selbst,
// nicht die CDN-Links - die sterben ohnehin mit der Nachricht).
export interface CachedMessage {
    authorTag: string;
    content: string;
    attachments: string[];
}

class LoggingService {
    async setLogChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getLogChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async cacheMessage(messageId: string, message: CachedMessage): Promise<void> {
        await redisService.setWithExpiry(KEYS.message(messageId), JSON.stringify(message), MESSAGE_CACHE_SECONDS);
    }

    async getCachedMessage(messageId: string): Promise<CachedMessage | null> {
        const raw = await redisService.get(KEYS.message(messageId));
        if (!raw) return null;

        try {
            return JSON.parse(raw) as CachedMessage;
        } catch {
            return null;
        }
    }

    async deleteCachedMessage(messageId: string): Promise<void> {
        await redisService.delete(KEYS.message(messageId));
    }
}

export default new LoggingService();
