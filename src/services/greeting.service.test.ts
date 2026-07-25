import { describe, it, expect, vi, beforeEach } from 'vitest';

const redis = vi.hoisted(() => ({
    set: vi.fn(),
    get: vi.fn(),
    setHashField: vi.fn(),
    getHashAll: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({ default: redis }));

import greetingService from './greeting.service.js';

describe('GreetingService', () => {
    beforeEach(() => {
        redis.set.mockReset();
        redis.get.mockReset();
        redis.setHashField.mockReset();
        redis.getHashAll.mockReset();
    });

    it('speichert und liest den Kanal unter GREETING:CHANNEL', async () => {
        await greetingService.setChannel('chan-1');
        expect(redis.set).toHaveBeenCalledWith('GREETING:CHANNEL', 'chan-1');

        redis.get.mockResolvedValue('chan-1');
        expect(await greetingService.getChannel()).toBe('chan-1');
        expect(redis.get).toHaveBeenCalledWith('GREETING:CHANNEL');
    });

    it('speichert und liest den Tagesmarker pro User im Hash GREETING:LAST_DAY', async () => {
        await greetingService.setLastGreetingDay('u1', '2026-07-21');
        expect(redis.setHashField).toHaveBeenCalledWith('GREETING:LAST_DAY', 'u1', '2026-07-21');

        redis.getHashAll.mockResolvedValue({ u1: '2026-07-21' });
        expect(await greetingService.getLastGreetingDay('u1')).toBe('2026-07-21');
        expect(redis.getHashAll).toHaveBeenCalledWith('GREETING:LAST_DAY');
    });

    it('liefert null, wenn die Person am Tag noch nicht begrüßt wurde', async () => {
        redis.getHashAll.mockResolvedValue({ u1: '2026-07-21' });
        expect(await greetingService.getLastGreetingDay('u2')).toBeNull();
    });
});
