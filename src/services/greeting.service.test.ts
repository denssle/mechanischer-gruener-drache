import { describe, it, expect, vi, beforeEach } from 'vitest';

const redis = vi.hoisted(() => ({
    set: vi.fn(),
    get: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({ default: redis }));

import greetingService from './greeting.service.js';

describe('GreetingService', () => {
    beforeEach(() => {
        redis.set.mockReset();
        redis.get.mockReset();
    });

    it('speichert und liest den Kanal unter GREETING:CHANNEL', async () => {
        await greetingService.setChannel('chan-1');
        expect(redis.set).toHaveBeenCalledWith('GREETING:CHANNEL', 'chan-1');

        redis.get.mockResolvedValue('chan-1');
        expect(await greetingService.getChannel()).toBe('chan-1');
        expect(redis.get).toHaveBeenCalledWith('GREETING:CHANNEL');
    });

    it('speichert und liest den Tagesmarker unter GREETING:LAST_DAY', async () => {
        await greetingService.setLastGreetingDay('2026-07-21');
        expect(redis.set).toHaveBeenCalledWith('GREETING:LAST_DAY', '2026-07-21');

        redis.get.mockResolvedValue('2026-07-21');
        expect(await greetingService.getLastGreetingDay()).toBe('2026-07-21');
        expect(redis.get).toHaveBeenCalledWith('GREETING:LAST_DAY');
    });
});
