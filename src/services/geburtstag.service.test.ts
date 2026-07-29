import {describe, it, expect, vi, beforeEach} from 'vitest';

const redisService = vi.hoisted(() => ({
    setHashField: vi.fn(),
    deleteHashField: vi.fn(),
    getHashAll: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({default: redisService}));

import geburtstagService, {formatGespeichert, parseGespeichert} from './geburtstag.service.js';

describe('formatGespeichert / parseGespeichert', () => {
    it('speichert mit und ohne Jahr in der deutschen Schreibweise', () => {
        expect(formatGespeichert({tag: 5, monat: 3, jahr: null})).toBe('05.03');
        expect(formatGespeichert({tag: 29, monat: 2, jahr: 1996})).toBe('29.02.1996');
    });

    it('liest beide Formen wieder ein', () => {
        expect(parseGespeichert('05.03')).toEqual({tag: 5, monat: 3, jahr: null});
        expect(parseGespeichert('29.02.1996')).toEqual({tag: 29, monat: 2, jahr: 1996});
    });

    it('ist ein sauberer Round-Trip', () => {
        for (const geburtstag of [{tag: 1, monat: 1, jahr: null}, {tag: 31, monat: 12, jahr: 2000}]) {
            expect(parseGespeichert(formatGespeichert(geburtstag))).toEqual(geburtstag);
        }
    });

    it.each(['', 'quatsch', '32.01', '05.13', '2000-03-05', '5.3.96'])(
        'lehnt den unbrauchbaren Wert "%s" ab', (wert) => {
            expect(parseGespeichert(wert)).toBeNull();
        });
});

describe('GeburtstagService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('speichert den Geburtstag als Hash-Feld', async () => {
        await geburtstagService.setGeburtstag('u1', {tag: 5, monat: 3, jahr: 1990});

        expect(redisService.setHashField).toHaveBeenCalledWith('GEBURTSTAG:DATEN', 'u1', '05.03.1990');
    });

    it('entfernt den Eintrag', async () => {
        await geburtstagService.entferneGeburtstag('u1');

        expect(redisService.deleteHashField).toHaveBeenCalledWith('GEBURTSTAG:DATEN', 'u1');
    });

    it('liefert den eigenen Geburtstag geparst zurück', async () => {
        redisService.getHashAll.mockResolvedValue({u1: '05.03.1990'});

        expect(await geburtstagService.getGeburtstag('u1')).toEqual({tag: 5, monat: 3, jahr: 1990});
    });

    it('liefert null, wenn nichts hinterlegt ist', async () => {
        redisService.getHashAll.mockResolvedValue({});

        expect(await geburtstagService.getGeburtstag('u1')).toBeNull();
    });

    // Ein kaputter Wert darf den täglichen Post nicht mitreißen - er wird übersprungen.
    it('überspringt unlesbare Einträge in getAlle', async () => {
        redisService.getHashAll.mockResolvedValue({u1: '05.03', u2: 'kaputt', u3: '29.02.1996'});

        expect(await geburtstagService.getAlle()).toEqual({
            u1: {tag: 5, monat: 3, jahr: null},
            u3: {tag: 29, monat: 2, jahr: 1996},
        });
    });

    it('speichert und liest Kanal und Tagesmarker', async () => {
        await geburtstagService.setChannel('c1');
        await geburtstagService.setLastPostDay('2026-07-29');

        expect(redisService.set).toHaveBeenCalledWith('GEBURTSTAG:CHANNEL', 'c1');
        expect(redisService.set).toHaveBeenCalledWith('GEBURTSTAG:LAST_DAY', '2026-07-29');

        redisService.get.mockResolvedValue('c1');
        expect(await geburtstagService.getChannel()).toBe('c1');
    });
});
