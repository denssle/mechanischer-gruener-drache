import redisService from './redis.service.js';

const KEYS = {
    channel: 'GREETING:CHANNEL',
    // Hash userId → Datum (YYYY-MM-DD) der zuletzt begrüßten ersten Nachricht dieser Person am Tag -
    // Doppelgruß-Schutz PRO Person, damit jede:r am Tag der eigenen ersten Nachricht begrüßt wird.
    lastDay: 'GREETING:LAST_DAY',
    // Hash userId → persönliches Emoji, aus der Chat-Historie gelernt (Feld pro Person).
    emoji: 'GREETING:EMOJI',
};

class GreetingService {
    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async getLastGreetingDay(userId: string): Promise<string | null> {
        const alle = await redisService.getHashAll(KEYS.lastDay);
        return alle[userId] ?? null;
    }

    async setLastGreetingDay(userId: string, day: string): Promise<void> {
        await redisService.setHashField(KEYS.lastDay, userId, day);
    }

    async setLearnedEmoji(userId: string, emoji: string): Promise<void> {
        await redisService.setHashField(KEYS.emoji, userId, emoji);
    }

    async getLearnedEmojis(): Promise<Record<string, string>> {
        return redisService.getHashAll(KEYS.emoji);
    }
}

export default new GreetingService();
