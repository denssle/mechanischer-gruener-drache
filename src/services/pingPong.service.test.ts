import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        hashFieldExists: vi.fn(async () => false),
        setHashField: vi.fn(),
        getHashAll: vi.fn(),
    },
    REDIS_KEYS: {PING_PONG: 'PING_PONG'}
}));

import redisService from './redis.service.js';
import pingPongService, {PING_PONG_KEYS} from './pingPong.service.js';

describe('pingPongService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Legacy-Format: eine Änderung würde alle bestehenden Punktestände verwaisen lassen.
    it('haelt die Key-Formate des laufenden Spielbetriebs fest', () => {
        expect(PING_PONG_KEYS.score('user-1')).toBe('user-1PING_PONG');
        expect(PING_PONG_KEYS.highscore).toBe('PING_PONG');
        expect(PING_PONG_KEYS.cooldown('user-1')).toBe('PING_PONG:COOLDOWN:user-1');
        expect(PING_PONG_KEYS.serie('user-1')).toBe('PING_PONG:SERIE:user-1');
        expect(PING_PONG_KEYS.rekord('user-1')).toBe('PING_PONG:REKORD:user-1');
    });

    it('liest und schreibt den Monatsmarker', async () => {
        vi.mocked(redisService.get).mockResolvedValue('2026-06');
        expect(await pingPongService.getLastSeason()).toBe('2026-06');
        expect(redisService.get).toHaveBeenCalledWith('PING_PONG:LAST_SEASON');

        await pingPongService.setLastSeason('2026-07');
        expect(redisService.set).toHaveBeenCalledWith('PING_PONG:LAST_SEASON', '2026-07');
    });

    it('setzt, liest und entfernt die Champion-Rolle', async () => {
        vi.mocked(redisService.get).mockResolvedValue('rolle-1');
        expect(await pingPongService.getChampionRole()).toBe('rolle-1');
        expect(redisService.get).toHaveBeenCalledWith('PING_PONG:CHAMPION_ROLE');

        await pingPongService.setChampionRole('rolle-1');
        expect(redisService.set).toHaveBeenCalledWith('PING_PONG:CHAMPION_ROLE', 'rolle-1');

        await pingPongService.removeChampionRole();
        expect(redisService.delete).toHaveBeenCalledWith('PING_PONG:CHAMPION_ROLE');
    });

    it('speichert einen Ruhmeshallen-Eintrag als JSON unter dem Monat', async () => {
        vi.mocked(redisService.hashFieldExists).mockResolvedValue(false);

        await expect(pingPongService.addRuhmeshalleEintrag('2026-06', 'user-1', 12)).resolves.toBe(true);
        expect(redisService.setHashField).toHaveBeenCalledWith(
            'PING_PONG:RUHMESHALLE', '2026-06', JSON.stringify({userId: 'user-1', punkte: 12})
        );
    });

    // Schutz gegen eine zweite Abrechnung desselben Monats (Abbruch zwischen Eintrag und Reset):
    // sonst wuerde der echte Champion still durch einen Uebriggebliebenen ersetzt.
    it('ueberschreibt einen bestehenden Monat nicht', async () => {
        vi.mocked(redisService.hashFieldExists).mockResolvedValue(true);

        await expect(pingPongService.addRuhmeshalleEintrag('2026-06', 'anderer', 1)).resolves.toBe(false);
        expect(redisService.setHashField).not.toHaveBeenCalled();
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
