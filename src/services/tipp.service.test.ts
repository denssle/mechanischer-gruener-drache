import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        getTimeToLive: vi.fn(),
        setWithExpiry: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import tippService, {
    TIPPS,
    NETTIGKEITEN,
    randomTipp,
    randomNettigkeit,
    kommtTippInFrage
} from './tipp.service.js';

describe('tipp.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        // Standard: kein aktiver Cooldown (Redis liefert -2, wenn der Key nicht existiert).
        vi.mocked(redisService.getTimeToLive).mockResolvedValue(-2);
    });

    describe('kommtTippInFrage', () => {
        it('sagt nein bei ephemeren Antworten (Fehler, Cooldown-Abfuhr, Admin-Quittung)', () => {
            expect(kommtTippInFrage('sport', true)).toBe(false);
        });

        it('sagt nein bei den Hilfe-Befehlen selbst', () => {
            expect(kommtTippInFrage('hilfe', false)).toBe(false);
            expect(kommtTippInFrage('spielwelt', false)).toBe(false);
        });

        it('sagt ja bei einer normalen öffentlichen Antwort', () => {
            expect(kommtTippInFrage('sport', false)).toBe(true);
            expect(kommtTippInFrage('online', false)).toBe(true);
        });
    });

    describe('holeZeileFuerUser', () => {
        it('liefert nichts, wenn der Würfel dagegen ist', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9); // >= CHANCE

            expect(await tippService.holeZeileFuerUser('user-1')).toBeNull();
            expect(redisService.getTimeToLive).not.toHaveBeenCalled();
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });

        it('liefert nichts, wenn die Person heute schon eine Zeile bekommen hat', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.05); // < CHANCE
            vi.mocked(redisService.getTimeToLive).mockResolvedValue(3600);

            expect(await tippService.holeZeileFuerUser('user-1')).toBeNull();
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });

        it('liefert einen Tipp und setzt den Tages-Cooldown', async () => {
            // 1. Wurf: unter CHANCE (Zeile kommt), 2. Wurf: über NETTIGKEIT_CHANCE (also ein Tipp),
            // 3. Wurf: Index in der Tipp-Liste.
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.05)
                .mockReturnValueOnce(0.9)
                .mockReturnValueOnce(0);

            const zeile = await tippService.holeZeileFuerUser('user-1');

            expect(TIPPS).toContain(zeile);
            expect(redisService.setWithExpiry).toHaveBeenCalledWith('TIPP:COOLDOWN:user-1', '1', 86400);
        });

        it('liefert manchmal eine Nettigkeit statt eines Tipps', async () => {
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.05)
                .mockReturnValueOnce(0.1) // < NETTIGKEIT_CHANCE
                .mockReturnValueOnce(0);

            expect(NETTIGKEITEN).toContain(await tippService.holeZeileFuerUser('user-1'));
        });
    });

    describe('Zeilen-Auswahl', () => {
        it('randomTipp liefert immer eine Zeile aus TIPPS', () => {
            for (let i = 0; i < 50; i++) {
                expect(TIPPS).toContain(randomTipp());
            }
        });

        it('randomNettigkeit liefert immer eine Zeile aus NETTIGKEITEN', () => {
            for (let i = 0; i < 50; i++) {
                expect(NETTIGKEITEN).toContain(randomNettigkeit());
            }
        });

        it('alle Zeilen bleiben deutlich unter dem Discord-Limit', () => {
            for (const zeile of [...TIPPS, ...NETTIGKEITEN]) {
                expect(zeile.length).toBeLessThanOrEqual(2000);
            }
        });

        // Doppelte Zeilen fallen beim Pflegen langer Listen leicht durch - und ausgerechnet
        // eine doppelte Nettigkeit würde man als Nutzer sofort merken.
        it('enthält keine doppelten Zeilen', () => {
            expect(new Set(TIPPS).size).toBe(TIPPS.length);
            expect(new Set(NETTIGKEITEN).size).toBe(NETTIGKEITEN.length);
        });

        it('hat genug Nettigkeiten, dass sich so schnell nichts wiederholt', () => {
            expect(NETTIGKEITEN.length).toBeGreaterThanOrEqual(100);
        });
    });
});
