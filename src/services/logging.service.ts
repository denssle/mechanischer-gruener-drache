import redisService from './redis.service.js';

const KEYS = {
    channel: 'LOGGING:CHANNEL',
};

class LoggingService {
    async setLogChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getLogChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }
}

export default new LoggingService();
