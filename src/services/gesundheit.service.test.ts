import {describe, it, expect, vi, beforeEach} from 'vitest';

const redis = vi.hoisted(() => ({
    verbunden: true,
    getConfigWert: vi.fn(),
    getInfo: vi.fn(),
}));
const clientReady = vi.hoisted(() => vi.fn(() => true));
const kanal = vi.hoisted(() => ({
    twitch: vi.fn(async (): Promise<string | null> => null),
    sport: vi.fn(async (): Promise<string | null> => null),
    logging: vi.fn(async (): Promise<string | null> => null),
    greeting: vi.fn(async (): Promise<string | null> => null),
    geburtstag: vi.fn(async (): Promise<string | null> => null),
    drachen: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock('../client.js', () => ({default: {isReady: clientReady}}));
vi.mock('./redis.service.js', () => ({default: redis}));
vi.mock('./twitch.user.service.js', () => ({default: {getNotificationChannel: kanal.twitch}}));
vi.mock('./sport.service.js', () => ({default: {getAnnouncementChannel: kanal.sport}}));
vi.mock('./logging.service.js', () => ({default: {getLogChannel: kanal.logging}}));
vi.mock('./greeting.service.js', () => ({default: {getChannel: kanal.greeting}}));
vi.mock('./geburtstag.service.js', () => ({default: {getChannel: kanal.geburtstag}}));
vi.mock('./drachen.service.js', () => ({default: {getChannel: kanal.drachen}}));

import {holePersistenz, parseInfo, pruefeGesundheit} from './gesundheit.service.js';

// Ausschnitt aus einem echten `INFO persistence` vom Host (2026-11-22).
const INFO_OK = [
    '# Persistence',
    'loading:0',
    'rdb_changes_since_last_save:0',
    'rdb_last_save_time:1795362430',
    'rdb_last_bgsave_status:ok',
    'aof_enabled:0',
    '',
].join('\r\n');

describe('parseInfo', () => {
    it('liest Schlüssel und Werte, überspringt Überschriften und Leerzeilen', () => {
        expect(parseInfo(INFO_OK)).toEqual({
            loading: '0',
            rdb_changes_since_last_save: '0',
            rdb_last_save_time: '1795362430',
            rdb_last_bgsave_status: 'ok',
            aof_enabled: '0',
        });
    });
});

describe('holePersistenz', () => {
    beforeEach(() => {
        redis.getConfigWert.mockReset().mockResolvedValue('3600 1 300 100 60 10000');
        redis.getInfo.mockReset().mockResolvedValue(INFO_OK);
    });

    it('liefert Regeln, Zeitpunkt und Status der letzten Sicherung', async () => {
        expect(await holePersistenz()).toEqual({
            regeln: '3600 1 300 100 60 10000',
            letzteSicherung: new Date(1795362430000),
            letzteSicherungOk: true,
        });
        expect(redis.getConfigWert).toHaveBeenCalledWith('save');
    });

    it('meldet ein leeres save als leere Regeln', async () => {
        redis.getConfigWert.mockResolvedValue('');

        expect((await holePersistenz()).regeln).toBe('');
    });

    it('erkennt eine fehlgeschlagene Sicherung', async () => {
        redis.getInfo.mockResolvedValue(INFO_OK.replace('bgsave_status:ok', 'bgsave_status:err'));

        expect((await holePersistenz()).letzteSicherungOk).toBe(false);
    });
});

describe('pruefeGesundheit', () => {
    beforeEach(() => {
        redis.verbunden = true;
        redis.getConfigWert.mockReset().mockResolvedValue('3600 1');
        redis.getInfo.mockReset().mockResolvedValue(INFO_OK);
        clientReady.mockReturnValue(true);
        Object.values(kanal).forEach(fn => fn.mockReset().mockResolvedValue(null));
        kanal.logging.mockResolvedValue('123');
    });

    it('ist gesund, wenn alles steht', async () => {
        expect(await pruefeGesundheit()).toEqual([]);
    });

    it('erkennt die leere Datenbank vom 2026-11-22 an fehlenden Kanälen', async () => {
        kanal.logging.mockResolvedValue(null);

        expect(await pruefeGesundheit()).toEqual(['Keine Kanal-Einstellung gesetzt, Datenbank leer?']);
    });

    it('reicht ein einziger gesetzter Kanal', async () => {
        kanal.logging.mockResolvedValue(null);
        kanal.drachen.mockResolvedValue('456');

        expect(await pruefeGesundheit()).toEqual([]);
    });

    it('meldet abgeschaltete Persistenz', async () => {
        redis.getConfigWert.mockResolvedValue('');

        expect(await pruefeGesundheit()).toEqual(['Redis speichert nicht auf Platte (save ist leer)']);
    });

    it('meldet eine fehlgeschlagene Sicherung', async () => {
        redis.getInfo.mockResolvedValue(INFO_OK.replace('bgsave_status:ok', 'bgsave_status:err'));

        expect(await pruefeGesundheit()).toEqual(['Letzte Redis-Sicherung fehlgeschlagen']);
    });

    it('fragt Redis nicht, solange es nicht verbunden ist', async () => {
        redis.verbunden = false;

        expect(await pruefeGesundheit()).toEqual(['Redis nicht verbunden']);
        expect(kanal.logging).not.toHaveBeenCalled();
    });

    it('meldet eine fehlende Discord-Verbindung', async () => {
        clientReady.mockReturnValue(false);

        expect(await pruefeGesundheit()).toEqual(['Discord-Verbindung nicht bereit']);
    });

    it('wird bei einem Redis-Fehler krank statt zu werfen', async () => {
        kanal.logging.mockRejectedValue(new Error('Socket closed unexpectedly'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(await pruefeGesundheit()).toEqual(['Redis-Abfrage fehlgeschlagen']);
    });
});
