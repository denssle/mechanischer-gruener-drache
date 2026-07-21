import redisService from './redis.service.js';

const KEYS = {
    channel: 'GREETING:CHANNEL',
    // Datum (YYYY-MM-DD) der zuletzt begrüßten "ersten Nachricht des Tages" - Doppelgruß-Schutz.
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

    async getLastGreetingDay(): Promise<string | null> {
        return redisService.get(KEYS.lastDay);
    }

    async setLastGreetingDay(day: string): Promise<void> {
        await redisService.set(KEYS.lastDay, day);
    }

    async setLearnedEmoji(userId: string, emoji: string): Promise<void> {
        await redisService.setHashField(KEYS.emoji, userId, emoji);
    }

    async getLearnedEmojis(): Promise<Record<string, string>> {
        return redisService.getHashAll(KEYS.emoji);
    }
}

export default new GreetingService();
