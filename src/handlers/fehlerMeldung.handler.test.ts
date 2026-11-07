import {beforeEach, describe, expect, it, vi} from 'vitest';

const service = vi.hoisted(() => ({getChannel: vi.fn()}));
const fetchChannel = vi.hoisted(() => vi.fn());
vi.mock('../services/fehlerMeldung.service.js', () => ({default: service}));
vi.mock('../client.js', () => ({default: {channels: {fetch: fetchChannel}}}));

import fehlerMeldungHandler, {
    baueMeldung,
    kuerzeFehler,
    MAX_ZEILEN,
    MAX_ZEILEN_LAENGE,
} from './fehlerMeldung.handler.js';

describe('kuerzeFehler', () => {
    // Stacktraces gehören ins Log, nicht in den Kanal.
    it('nimmt nur die erste Zeile', () => {
        expect(kuerzeFehler('Fehler: kaputt\n    at foo.ts:1')).toBe('Fehler: kaputt');
    });

    it('kürzt lange Zeilen', () => {
        expect(kuerzeFehler('x'.repeat(500)).length).toBeLessThanOrEqual(MAX_ZEILEN_LAENGE + 2);
    });

    it('kann den Codeblock der Meldung nicht aufbrechen', () => {
        expect(kuerzeFehler('```')).not.toContain('`');
    });
});

describe('baueMeldung', () => {
    it('zählt alle Fehler und zeigt die häufigsten zuerst', () => {
        const text = baueMeldung(new Map([['selten', 1], ['oft', 4]]), 1_700_000_000_000);

        expect(text).toContain('5 Fehler im Bot');
        expect(text).toContain('<t:1700000000:R>');
        expect(text.indexOf('4× oft')).toBeLessThan(text.indexOf('1× selten'));
    });

    it('nennt, was nicht mehr passt, und bleibt unter dem Discord-Limit', () => {
        const fehler = new Map(Array.from({length: 20}, (_, i) => [`${i}${'x'.repeat(MAX_ZEILEN_LAENGE)}`, 1]));

        const text = baueMeldung(fehler, 0);

        expect(text).toContain(`… und ${20 - MAX_ZEILEN} weitere Arten.`);
        expect(text.length).toBeLessThanOrEqual(2000);
    });
});

describe('FehlerMeldungHandler', () => {
    const send = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        fehlerMeldungHandler.zuruecksetzen();
        service.getChannel.mockResolvedValue('kanal-1');
        fetchChannel.mockResolvedValue({send});
        send.mockResolvedValue(undefined);
    });

    it('sendet nichts, solange kein Fehler passiert ist', async () => {
        await fehlerMeldungHandler.sendeSammlung();

        expect(service.getChannel).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it('fasst gleiche Fehler zusammen', async () => {
        fehlerMeldungHandler.merke('Redis weg');
        fehlerMeldungHandler.merke('Redis weg');

        await fehlerMeldungHandler.sendeSammlung();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toContain('2× Redis weg');
    });

    // Sonst fiele der Kanal bei einem Ausfall voll.
    it('meldet höchstens einmal in zehn Minuten, die Fehler bleiben so lange liegen', async () => {
        fehlerMeldungHandler.merke('erster');
        await fehlerMeldungHandler.sendeSammlung();
        fehlerMeldungHandler.merke('zweiter');
        await fehlerMeldungHandler.sendeSammlung();

        expect(send).toHaveBeenCalledTimes(1);

        vi.useFakeTimers({toFake: ['Date'], now: Date.now() + 11 * 60 * 1000});
        try {
            await fehlerMeldungHandler.sendeSammlung();
        } finally {
            vi.useRealTimers();
        }

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0]).toContain('zweiter');
    });

    it('behält die Sammlung, wenn das Senden scheitert', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        send.mockRejectedValueOnce(new Error('Missing Access'));
        fehlerMeldungHandler.merke('wichtig');

        await fehlerMeldungHandler.sendeSammlung();
        await fehlerMeldungHandler.sendeSammlung();

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0]).toContain('wichtig');
        warn.mockRestore();
    });

    // console.error würde hier eine Schleife bauen: der Fehler beim Melden wäre der nächste Fehler.
    it('meldet das eigene Scheitern nur als Warnung', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        send.mockRejectedValueOnce(new Error('Missing Access'));
        fehlerMeldungHandler.merke('wichtig');

        await fehlerMeldungHandler.sendeSammlung();

        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
        error.mockRestore();
    });

    it('verwirft die Sammlung ohne Kanal, statt später alte Fehler zu melden', async () => {
        service.getChannel.mockResolvedValueOnce(null);
        fehlerMeldungHandler.merke('alt');
        await fehlerMeldungHandler.sendeSammlung();

        await fehlerMeldungHandler.sendeSammlung();

        expect(send).not.toHaveBeenCalled();
    });

    it('wächst nicht unbegrenzt', async () => {
        for (let i = 0; i < 1000; i++) {
            fehlerMeldungHandler.merke(`Fehler ${i}`);
        }

        await fehlerMeldungHandler.sendeSammlung();

        expect(send.mock.calls[0][0]).toContain('20 Fehler im Bot');
    });
});
