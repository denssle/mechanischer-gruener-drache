import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        setHashField: vi.fn(),
        getHashAll: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import pingPongService from './pingPong.service.js';

describe('pingPongService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('liest und schreibt den Monatsmarker', async () => {
        vi.mocked(redisService.get).mockResolvedValue('2026-06');
        expect(await pingPongService.getLastSeason()).toBe('2026-06');
        expect(redisService.get).toHaveBeenCalledWith('PING_PONG:LAST_SEASON');

        await pingPongService.setLastSeason('2026-07');
        expect(redisService.set).toHaveBeenCalledWith('PING_PONG:LAST_SEASON', '2026-07');
    });

    it('setzt und entfernt die Champion-Rolle', async () => {
        await pingPongService.setChampionRole('rolle-1');
        expect(redisService.set).toHaveBeenCalledWith('PING_PONG:CHAMPION_ROLE', 'rolle-1');

        await pingPongService.removeChampionRole();
        expect(redisService.delete).toHaveBeenCalledWith('PING_PONG:CHAMPION_ROLE');
    });

    it('speichert einen Ruhmeshallen-Eintrag als JSON unter dem Monat', async () => {
        await pingPongService.addRuhmeshalleEintrag('2026-06', 'user-1', 12);

        expect(redisService.setHashField).toHaveBeenCalledWith(
            'PING_PONG:RUHMESHALLE', '2026-06', JSON.stringify({userId: 'user-1', punkte: 12})
        );
    });

    it('gibt die Ruhmeshalle absteigend nach Monat zurück', async () => {
        vi.mocked(redisService.getHashAll).mockResolvedValue({
            '2026-05': JSON.stringify({userId: 'user-2', punkte: 9}),
            '2026-06': JSON.stringify({userId: 'user-1', punkte: 12}),
            '2025-12': JSON.stringify({userId: 'user-3', punkte: 4}),
        });

        expect(await pingPongService.getRuhmeshalle()).toEqual([
            {monat: '2026-06', userId: 'user-1', punkte: 12},
            {monat: '2026-05', userId: 'user-2', punkte: 9},
            {monat: '2025-12', userId: 'user-3', punkte: 4},
        ]);
    });

    // Ein kaputter Wert darf die Ruhmeshalle nicht mitreißen (Muster getAlle() im Geburtstags-Service).
    it('überspringt unlesbare Einträge, statt sie durchzureichen', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.mocked(redisService.getHashAll).mockResolvedValue({
            '2026-06': JSON.stringify({userId: 'user-1', punkte: 12}),
            '2026-05': 'kein json',
            '2026-04': JSON.stringify({punkte: 3}),
        });

        expect(await pingPongService.getRuhmeshalle()).toEqual([
            {monat: '2026-06', userId: 'user-1', punkte: 12},
        ]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('kommt mit einer leeren Ruhmeshalle klar', async () => {
        vi.mocked(redisService.getHashAll).mockResolvedValue({});
        expect(await pingPongService.getRuhmeshalle()).toEqual([]);
    });
});
