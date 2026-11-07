import {describe, it, expect, vi, beforeEach} from 'vitest';

const redisService = vi.hoisted(() => ({
    set: vi.fn(),
    get: vi.fn(),
    addToSet: vi.fn(),
    removeFromSet: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({default: redisService}));

import rollenhinweisService from './rollenhinweis.service.js';

describe('RollenhinweisService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('speichert und liest den Kanal', async () => {
        redisService.get.mockResolvedValue('kanal-1');

        await rollenhinweisService.setChannel('kanal-1');

        expect(redisService.set).toHaveBeenCalledWith('ROLLENHINWEIS:CHANNEL', 'kanal-1');
        expect(await rollenhinweisService.getChannel()).toBe('kanal-1');
    });

    it('meldet beim Markieren, ob die Person neu war', async () => {
        redisService.addToSet.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        expect(await rollenhinweisService.markiereHingewiesen('user-1')).toBe(true);
        expect(await rollenhinweisService.markiereHingewiesen('user-1')).toBe(false);
        expect(redisService.addToSet).toHaveBeenCalledWith('ROLLENHINWEIS:HINGEWIESEN', 'user-1');
    });

    it('vergisst eine Markierung wieder', async () => {
        await rollenhinweisService.vergiss('user-1');

        expect(redisService.removeFromSet).toHaveBeenCalledWith('ROLLENHINWEIS:HINGEWIESEN', 'user-1');
    });
});
