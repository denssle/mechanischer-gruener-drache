import redisService from './redis.service.js';

const KEYS = {
    // Wer in der laufenden Runde noch dran ist. Leer = es läuft nichts.
    warteschlange: 'ROLLENHINWEIS:DM_WARTESCHLANGE',
    // Dauerhaft: wer je angeschrieben wurde, wird es nie wieder.
    angeschrieben: 'ROLLENHINWEIS:DM_ANGESCHRIEBEN',
    // Teilmenge von angeschrieben: die DM kam nicht an.
    nichtZugestellt: 'ROLLENHINWEIS:DM_NICHT_ZUGESTELLT',
};

class RollenDmService {
    async getWarteschlange(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.warteschlange);
    }

    async inWarteschlange(userId: string): Promise<void> {
        await redisService.addToSet(KEYS.warteschlange, userId);
    }

    async ausWarteschlange(userId: string): Promise<void> {
        await redisService.removeFromSet(KEYS.warteschlange, userId);
    }

    async leereWarteschlange(): Promise<void> {
        await redisService.delete(KEYS.warteschlange);
    }

    async getAngeschrieben(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.angeschrieben);
    }

    // true = die Person war noch nicht vermerkt. Ein Schritt (SADD), damit niemand doppelt dran ist.
    async markiereAngeschrieben(userId: string): Promise<boolean> {
        return redisService.addToSet(KEYS.angeschrieben, userId);
    }

    async getNichtZugestellt(): Promise<string[]> {
        return redisService.getSetMembers(KEYS.nichtZugestellt);
    }

    async markiereNichtZugestellt(userId: string): Promise<void> {
        await redisService.addToSet(KEYS.nichtZugestellt, userId);
    }
}

export default new RollenDmService();
