import redisService from './redis.service.js';

const KEYS = {
    channel: 'FEHLER:CHANNEL',
};

class FehlerMeldungService {
    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }
}

export default new FehlerMeldungService();
