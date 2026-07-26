import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        addToSet: vi.fn(),
        removeFromSet: vi.fn(),
        isSetMember: vi.fn(),
        getSetMembers: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import anstupserService from './anstupser.service.js';

const ABOS = 'ANSTUPSER:ABOS';
const LAST_DAY = 'ANSTUPSER:LAST_DAY';

describe('AnstupserService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('abonniert über ein Set (dadurch von sich aus idempotent)', async () => {
        await anstupserService.abonniere('user-1');
        expect(redisService.addToSet).toHaveBeenCalledWith(ABOS, 'user-1');
    });

    it('kündigt über sRem', async () => {
        await anstupserService.kuendige('user-1');
        expect(redisService.removeFromSet).toHaveBeenCalledWith(ABOS, 'user-1');
    });

    it('prüft die Mitgliedschaft ohne das ganze Set zu holen', async () => {
        vi.mocked(redisService.isSetMember).mockResolvedValue(true);

        expect(await anstupserService.istAbonniert('user-1')).toBe(true);
        expect(redisService.isSetMember).toHaveBeenCalledWith(ABOS, 'user-1');
        expect(redisService.getSetMembers).not.toHaveBeenCalled();
    });

    it('liefert alle Abonnenten', async () => {
        vi.mocked(redisService.getSetMembers).mockResolvedValue(['a', 'b']);

        expect(await anstupserService.holeAbonnenten()).toEqual(['a', 'b']);
        expect(redisService.getSetMembers).toHaveBeenCalledWith(ABOS);
    });

    it('liest und schreibt den Tagesmarker', async () => {
        vi.mocked(redisService.get).mockResolvedValue('2026-07-26');
        expect(await anstupserService.getLastSentDay()).toBe('2026-07-26');
        expect(redisService.get).toHaveBeenCalledWith(LAST_DAY);

        await anstupserService.setLastSentDay('2026-07-27');
        expect(redisService.set).toHaveBeenCalledWith(LAST_DAY, '2026-07-27');
    });
});
