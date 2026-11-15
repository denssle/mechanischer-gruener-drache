import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Collection, DiscordAPIError, Guild} from 'discord.js';

const {getUser} = vi.hoisted(() => ({getUser: vi.fn()}));
vi.mock('./user.service.js', () => ({default: {getUser}}));

import {holeAnzeigenamen, UNBEKANNTER_NAME, vergissMeldungen} from './anzeigename.service.js';

function mockGuild(imCache: Record<string, string>, abrufbar: Record<string, string> = {}, abrufFehler?: Error) {
    const fetch = vi.fn(async ({user}: {user: string[]}) => {
        if (abrufFehler) throw abrufFehler;
        return new Collection(user.filter(id => id in abrufbar).map(id => [id, {displayName: abrufbar[id]}]));
    });
    const cache = new Map(Object.entries(imCache).map(([id, displayName]) => [id, {displayName}]));
    return {guild: {members: {cache, fetch}} as unknown as Guild, fetch};
}

describe('holeAnzeigenamen', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vergissMeldungen();
        getUser.mockReset().mockResolvedValue(null);
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('nimmt Mitglieder aus dem Cache, ohne Discord zu fragen', async () => {
        const {guild, fetch} = mockGuild({'1': 'Anna'});

        const namen = await holeAnzeigenamen(guild, ['1'], 'Test');

        expect(namen.get('1')).toBe('Anna');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('holt fehlende Mitglieder in einem gemeinsamen Abruf nach', async () => {
        const {guild, fetch} = mockGuild({'1': 'Anna'}, {'2': 'Bert', '3': 'Cleo'});

        const namen = await holeAnzeigenamen(guild, ['1', '2', '3'], 'Test');

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith({user: ['2', '3']});
        expect([...namen.values()]).toEqual(['Anna', 'Bert', 'Cleo']);
    });

    it('fragt Discord in Stücken zu höchstens 100 IDs', async () => {
        const {guild, fetch} = mockGuild({});
        const ids = Array.from({length: 150}, (_, i) => String(i + 1));

        await holeAnzeigenamen(guild, ids, 'Test');

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[0][0].user).toHaveLength(100);
        expect(fetch.mock.calls[1][0].user).toHaveLength(50);
    });

    it('fällt auf den gespeicherten Namen zurück, wenn die Person nicht mehr auf dem Server ist', async () => {
        const {guild} = mockGuild({});
        getUser.mockResolvedValue({displayName: 'Ehemalige'});

        const namen = await holeAnzeigenamen(guild, ['9'], 'Test');

        expect(namen.get('9')).toBe('Ehemalige');
        expect(warn).not.toHaveBeenCalled();
    });

    it('loggt den Grund, wenn der Mitglieder-Abruf scheitert, und nimmt dann gespeicherte Namen', async () => {
        const fehler = new DiscordAPIError({code: 50001, message: 'Missing Access'}, 50001, 403, 'GET', 'x', {});
        const {guild} = mockGuild({}, {}, fehler);
        getUser.mockResolvedValue({displayName: 'Gespeichert'});

        const namen = await holeAnzeigenamen(guild, ['9'], 'Ruhmeshalle');

        expect(namen.get('9')).toBe('Gespeichert');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ruhmeshalle: 1 Mitglieder nicht abrufbar'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Discord-Code 50001'));
    });

    it('zeigt "unbekannt" und loggt ID samt Grund, wenn gar nichts zu finden ist', async () => {
        const {guild} = mockGuild({});

        const namen = await holeAnzeigenamen(guild, ['9'], 'Ruhmeshalle');

        expect(namen.get('9')).toBe(UNBEKANNTER_NAME);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Ruhmeshalle: Name für 9 nicht ermittelbar \(nicht \(mehr\) auf dem Server/));
    });

    it('meldet dieselbe unbekannte ID im selben Kontext nur einmal', async () => {
        const {guild} = mockGuild({});

        await holeAnzeigenamen(guild, ['9'], 'Ruhmeshalle');
        await holeAnzeigenamen(guild, ['9'], 'Ruhmeshalle');
        await holeAnzeigenamen(guild, ['9'], 'Geburtstagsliste');

        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('nennt einen kaputten gespeicherten Eintrag als Grund', async () => {
        getUser.mockRejectedValue(new SyntaxError('Unexpected token'));

        const namen = await holeAnzeigenamen(null, ['9'], 'Test');

        expect(namen.get('9')).toBe(UNBEKANNTER_NAME);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('gespeicherter Name nicht lesbar: Unexpected token'));
    });

    it('entschärft Markdown in Namen und liefert jede ID nur einmal', async () => {
        const {guild} = mockGuild({'1': '*Stern*_chen_'});

        const namen = await holeAnzeigenamen(guild, ['1', '1'], 'Test');

        expect(namen.size).toBe(1);
        expect(namen.get('1')).toBe('\\*Stern\\*\\_chen\\_');
    });
});
