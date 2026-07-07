import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/redis.service.js', () => ({
    default: {
        get: vi.fn(),
        incrementFloat: vi.fn(),
    }
}));

import redisService from '../services/redis.service.js';
import blahajService from './blahaj.service.js';

describe('BlahajService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('addEuroAmount', () => {
        it('erhöht den Zähler und gibt die neue Gesamtsumme zurück', async () => {
            vi.mocked(redisService.incrementFloat).mockResolvedValue(160);

            const total = await blahajService.addEuroAmount(60);

            expect(redisService.incrementFloat).toHaveBeenCalledWith('BLAHAJ:TOTAL_EUR', 60);
            expect(total).toBe(160);
        });
    });

    describe('getTotalEur', () => {
        it('parst den gespeicherten Wert', async () => {
            vi.mocked(redisService.get).mockResolvedValue('4280.5');

            expect(await blahajService.getTotalEur()).toBe(4280.5);
        });

        it('gibt 0 zurück wenn noch nichts gespeichert ist', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            expect(await blahajService.getTotalEur()).toBe(0);
        });
    });
});
