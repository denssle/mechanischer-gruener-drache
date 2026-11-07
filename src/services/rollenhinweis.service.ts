import redisService from './redis.service.js';

const KEYS = {
    channel: 'ROLLENHINWEIS:CHANNEL',
    // Kanal mit dem Rollen-Button, auf den der Hinweis verlinkt. Optional.
    rollenKanal: 'ROLLENHINWEIS:ROLLENKANAL',
    // Set der User-IDs, die den Hinweis schon bekommen haben - jede Person genau einmal, für immer.
    hingewiesen: 'ROLLENHINWEIS:HINGEWIESEN',
    // Kanal für den Willkommensgruß beim Beitritt. Ohne Kanal bleibt der Bot still.
    willkommensKanal: 'ROLLENHINWEIS:WILLKOMMENSKANAL',
    // Die Rolle, die den Server öffnet. Nur für die Zählung in /diagnose, optional.
    hauptrolle: 'ROLLENHINWEIS:HAUPTROLLE',
};

class RollenhinweisService {
    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async setRollenKanal(channelId: string): Promise<void> {
        await redisService.set(KEYS.rollenKanal, channelId);
    }

    async getRollenKanal(): Promise<string | null> {
        return redisService.get(KEYS.rollenKanal);
    }

    async setWillkommensKanal(channelId: string): Promise<void> {
        await redisService.set(KEYS.willkommensKanal, channelId);
    }

    async getWillkommensKanal(): Promise<string | null> {
        return redisService.get(KEYS.willkommensKanal);
    }

    async setHauptrolle(rolleId: string): Promise<void> {
        await redisService.set(KEYS.hauptrolle, rolleId);
    }

    async getHauptrolle(): Promise<string | null> {
        return redisService.get(KEYS.hauptrolle);
    }

    async removeHauptrolle(): Promise<void> {
        await redisService.delete(KEYS.hauptrolle);
    }

    async getHingewiesene(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.hingewiesen);
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
