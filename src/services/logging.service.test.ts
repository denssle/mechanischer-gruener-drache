import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import loggingService from './logging.service.js';

describe('LoggingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('speichert den Log-Channel', async () => {
        await loggingService.setLogChannel('channel-1');

        expect(redisService.set).toHaveBeenCalledWith('LOGGING:CHANNEL', 'channel-1');
    });

    it('liest den Log-Channel', async () => {
        vi.mocked(redisService.get).mockResolvedValue('channel-1');

        const channelId = await loggingService.getLogChannel();

        expect(redisService.get).toHaveBeenCalledWith('LOGGING:CHANNEL');
        expect(channelId).toBe('channel-1');
    });

    it('gibt null zurück wenn kein Channel gesetzt ist', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        const channelId = await loggingService.getLogChannel();

        expect(channelId).toBeNull();
    });
});
