import {describe, it, expect, vi, afterEach} from 'vitest';
import {DiscordAPIError, RESTJSONErrorCodes} from 'discord.js';
import {beschreibeFehler, warneUndWeiter} from './fehler.service.js';

function discordFehler(code: number, message: string, inhalt: string): DiscordAPIError {
    return new DiscordAPIError(
        {code, message}, code, 404, 'PATCH', 'https://discord.com/api/v10/x',
        {files: undefined, body: {content: inhalt}});
}

describe('beschreibeFehler', () => {
    it('nennt bei Discord-Fehlern Meldung, Code und HTTP-Status', () => {
        const text = beschreibeFehler(discordFehler(RESTJSONErrorCodes.UnknownMember, 'Unknown Member', 'egal'));

        expect(text).toContain('Unknown Member');
        expect(text).toContain(`Discord-Code ${RESTJSONErrorCodes.UnknownMember}`);
        expect(text).toContain('HTTP 404');
    });

    // Der requestBody trägt den Text, den der Bot senden wollte - der gehört nicht ins Log.
    it('lässt den Inhalt der gescheiterten Anfrage weg', () => {
        const text = beschreibeFehler(discordFehler(50001, 'Missing Access', 'geheimer Nachrichtentext'));

        expect(text).not.toContain('geheimer Nachrichtentext');
    });

    it('nimmt bei normalen Fehlern die Meldung und kommt mit Nicht-Fehlern klar', () => {
        expect(beschreibeFehler(new Error('kaputt'))).toBe('kaputt');
        expect(beschreibeFehler('roh')).toBe('roh');
    });
});

describe('warneUndWeiter', () => {
    afterEach(() => vi.restoreAllMocks());

    it('schreibt Kontext und Grund ins Log und liefert null', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const ergebnis = await Promise.reject(new Error('weg'))
            .catch(warneUndWeiter('Kanal 123 nicht abrufbar'));

        expect(ergebnis).toBeNull();
        expect(warn).toHaveBeenCalledWith('Kanal 123 nicht abrufbar: weg');
    });
});
