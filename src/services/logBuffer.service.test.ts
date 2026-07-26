import {describe, it, expect, beforeEach, vi} from 'vitest';

// config.json mit einem ausreichend langen Secret, um die Redaktion zu testen.
vi.mock('../../config.json', () => ({
    default: {
        BOT_TOKEN: 'super-geheimes-token-1234',
        CLIENT_ID: 'x',
        GUILD_ID: 'g'
    }
}));

import {
    MAX_ENTRIES,
    clearLogBuffer,
    getLogEntries,
    installLogCapture,
    redigiere,
} from './logBuffer.service.js';

describe('logBuffer.service', () => {
    beforeEach(() => {
        clearLogBuffer();
    });

    describe('redigiere', () => {
        it('ersetzt bekannte Secrets durch ***', () => {
            expect(redigiere('Fehler mit super-geheimes-token-1234 aufgetreten'))
                .toBe('Fehler mit *** aufgetreten');
        });

        it('lässt normalen Text unangetastet', () => {
            expect(redigiere('nichts Geheimes hier')).toBe('nichts Geheimes hier');
        });
    });

    describe('installLogCapture / getLogEntries', () => {
        it('schneidet console.log/warn/error mit passendem Level mit', () => {
            installLogCapture();
            clearLogBuffer();

            console.log('eine Info');
            console.warn('eine Warnung');
            console.error('ein Fehler');

            const entries = getLogEntries();
            expect(entries).toHaveLength(3);
            expect(entries[0]).toMatchObject({level: 'log', text: 'eine Info'});
            expect(entries[1]).toMatchObject({level: 'warn', text: 'eine Warnung'});
            expect(entries[2]).toMatchObject({level: 'error', text: 'ein Fehler'});
        });

        it('formatiert mehrere Argumente wie console (util.format) und redigiert', () => {
            installLogCapture();
            clearLogBuffer();

            console.log('Wert:', {a: 1}, 'Token', 'super-geheimes-token-1234');

            expect(getLogEntries()[0].text).toBe("Wert: { a: 1 } Token ***");
        });

        it('ist idempotent - ein zweiter Aufruf verdoppelt nichts', () => {
            installLogCapture();
            installLogCapture();
            clearLogBuffer();

            console.log('nur einmal');

            expect(getLogEntries()).toHaveLength(1);
        });

        it('begrenzt den Puffer auf MAX_ENTRIES (älteste fallen raus)', () => {
            installLogCapture();
            clearLogBuffer();

            for (let i = 0; i < MAX_ENTRIES + 5; i++) {
                console.log(`zeile ${i}`);
            }

            const entries = getLogEntries();
            expect(entries).toHaveLength(MAX_ENTRIES);
            // Die ersten 5 Zeilen sind rausgefallen -> jetzt beginnt es bei "zeile 5".
            expect(entries[0].text).toBe('zeile 5');
            expect(entries[entries.length - 1].text).toBe(`zeile ${MAX_ENTRIES + 4}`);
        });

        it('getLogEntries gibt eine Kopie zurück (kein versehentliches Mutieren des Puffers)', () => {
            installLogCapture();
            clearLogBuffer();
            console.log('drin');

            const kopie = getLogEntries();
            kopie.push({zeit: 0, level: 'log', text: 'gefälscht'});

            expect(getLogEntries()).toHaveLength(1);
        });
    });
});
