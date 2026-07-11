import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        setWithExpiry: vi.fn(),
        delete: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import loggingService, { MESSAGE_CACHE_SECONDS } from './logging.service.js';

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

    describe('Nachrichten-Cache', () => {
        it('speichert Inhalt + Anhang-Namen mit TTL (kein Dauer-Archiv)', async () => {
            await loggingService.cacheMessage('m1', {authorTag: 'User#0001', content: 'Hallo', attachments: ['bild.png']});

            expect(redisService.setWithExpiry).toHaveBeenCalledWith(
                'LOGGING:MESSAGE:m1',
                JSON.stringify({authorTag: 'User#0001', content: 'Hallo', attachments: ['bild.png']}),
                MESSAGE_CACHE_SECONDS
            );
            expect(MESSAGE_CACHE_SECONDS).toBe(7 * 24 * 60 * 60);
        });

        it('liest eine zwischengespeicherte Nachricht', async () => {
            vi.mocked(redisService.get).mockResolvedValue(
                JSON.stringify({authorTag: 'User#0001', content: 'Hallo', attachments: []})
            );

            expect(await loggingService.getCachedMessage('m1')).toEqual({
                authorTag: 'User#0001', content: 'Hallo', attachments: [],
            });
        });

        it('gibt null zurück, wenn nichts (mehr) gespeichert ist oder der Eintrag kaputt ist', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);
            expect(await loggingService.getCachedMessage('m1')).toBeNull();

            vi.mocked(redisService.get).mockResolvedValue('kein json');
            expect(await loggingService.getCachedMessage('m1')).toBeNull();
        });

        it('löscht einen Eintrag', async () => {
            await loggingService.deleteCachedMessage('m1');

            expect(redisService.delete).toHaveBeenCalledWith('LOGGING:MESSAGE:m1');
        });
    });
});
