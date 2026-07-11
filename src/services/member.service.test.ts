import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        increment: vi.fn(),
        get: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import memberService from './member.service.js';

describe('member.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('zaehleBeitritt', () => {
        it('zählt hoch und gibt den neuen Stand zurück', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(2);

            expect(await memberService.zaehleBeitritt('user-1')).toBe(2);
            expect(redisService.increment).toHaveBeenCalledWith('MEMBER:JOIN_COUNT:user-1');
        });

        it('liefert beim allerersten Beitritt eine 1 (INCR legt den Key mit 0 an)', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(1);

            expect(await memberService.zaehleBeitritt('neu')).toBe(1);
        });
    });

    describe('getBeitrittsAnzahl', () => {
        it('liest den gespeicherten Stand', async () => {
            vi.mocked(redisService.get).mockResolvedValue('4');

            expect(await memberService.getBeitrittsAnzahl('user-1')).toBe(4);
        });

        it('gibt 0 zurück, wenn zu der Person nichts gespeichert ist', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            expect(await memberService.getBeitrittsAnzahl('unbekannt')).toBe(0);
        });
    });
});
