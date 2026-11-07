import redisService from './redis.service.js';

const KEYS = {
    channel: 'ROLLENHINWEIS:CHANNEL',
    // Set der User-IDs, die den Hinweis schon bekommen haben - jede Person genau einmal, für immer.
    hingewiesen: 'ROLLENHINWEIS:HINGEWIESEN',
};

class RollenhinweisService {
    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    // true = die Person war noch nicht vermerkt und ist es jetzt. Ein Schritt (SADD), damit zwei
    // schnell hintereinander geschickte Nachrichten nicht beide einen Hinweis auslösen.
    async markiereHingewiesen(userId: string): Promise<boolean> {
        return redisService.addToSet(KEYS.hingewiesen, userId);
    }

    // Rückweg, falls die Antwort nicht rausging - sonst wäre die Person vermerkt, ohne je etwas
    // gesehen zu haben.
    async vergiss(userId: string): Promise<void> {
        await redisService.removeFromSet(KEYS.hingewiesen, userId);
    }
}

export default new RollenhinweisService();
