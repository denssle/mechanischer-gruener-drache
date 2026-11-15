import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

const rollenDm = vi.hoisted(() => ({
    getWarteschlange: vi.fn(async (): Promise<string[]> => []),
    inWarteschlange: vi.fn(),
    ausWarteschlange: vi.fn(),
    leereWarteschlange: vi.fn(),
    getAngeschrieben: vi.fn(async (): Promise<string[]> => []),
    markiereAngeschrieben: vi.fn(async () => true),
    getNichtZugestellt: vi.fn(async (): Promise<string[]> => []),
    markiereNichtZugestellt: vi.fn(),
}));
const hinweis = vi.hoisted(() => ({
    getHauptrolle: vi.fn(async (): Promise<string | null> => 'haupt'),
    getRollenKanal: vi.fn(async (): Promise<string | null> => 'kanal-rollen'),
}));
const sendeDm = vi.hoisted(() => vi.fn(async () => true));
const guildsCache = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../client.js', () => ({default: {guilds: {cache: guildsCache}}}));
vi.mock('../services/rollenDm.service.js', () => ({default: rollenDm}));
vi.mock('../services/rollenhinweis.service.js', () => ({default: hinweis}));
vi.mock('../services/dm.service.js', () => ({sendeDm}));

import {Collection, DiscordAPIError, RESTJSONErrorCodes} from 'discord.js';
import config from '../../config.json' with {type: 'json'};
import rollenDmHandler, {istVersandZeit, rollenDmText, waehleEmpfaenger} from './rollenDm.handler.js';

const TAG = 24 * 60 * 60 * 1000;
const JETZT = new Date(2026, 10, 7, 18, 10).getTime();

const mockMitglied = (id: string, rollen: string[] = [], vorTagen = 400, bot = false) => ({
    id,
    user: {bot},
    joinedTimestamp: JETZT - vorTagen * TAG,
    roles: {cache: new Collection(rollen.map(rolle => [rolle, {id: rolle}]))},
}) as any;

const unbekanntesMitglied = () => new DiscordAPIError(
    {code: RESTJSONErrorCodes.UnknownMember, message: 'Unknown Member'},
    RESTJSONErrorCodes.UnknownMember, 404, 'GET', 'https://discord.com/api/v10/x', {});

const mockGuild = (mitglieder: any[]) => {
    const karte = new Map(mitglieder.map(mitglied => [mitglied.id, mitglied]));
    return {
        id: config.GUILD_ID,
        name: 'Testserver',
        roles: {cache: new Map([['haupt', {id: 'haupt', name: 'Einwohner'}]])},
        members: {
            cache: karte,
            fetch: vi.fn(async (id?: string) => {
                if (id === undefined) return karte;
                // So meldet Discord "nicht auf dem Server" wirklich - nicht irgendein Fehler.
                if (!karte.has(id)) throw unbekanntesMitglied();
                return karte.get(id);
            }),
        },
    };
};

describe('istVersandZeit', () => {
    it.each([
        [17, 0, true],
        [19, 50, true],
        [18, 5, false],
        [16, 50, false],
        [20, 0, false],
    ])('%i:%i Uhr -> %s', (stunde, minute, erwartet) => {
        expect(istVersandZeit(new Date(2026, 10, 7, stunde, minute))).toBe(erwartet);
    });
});

describe('rollenDmText', () => {
    it('nennt Server, Rolle und Link und sagt, dass es einmalig ist', () => {
        const text = rollenDmText('Testserver', 'Einwohner', 'https://discord.com/channels/1/2');

        expect(text).toContain('„Testserver“');
        expect(text).toContain('„Einwohner“');
        expect(text).toContain('https://discord.com/channels/1/2');
        expect(text).toContain('einmalige Erinnerung');
    });
});

describe('waehleEmpfaenger', () => {
    it('nimmt nur alte Mitglieder ohne Hauptrolle, die noch nie angeschrieben wurden', () => {
        const empfaenger = waehleEmpfaenger([
            mockMitglied('passt'),
            mockMitglied('nur-twitch', ['twitch']),
            mockMitglied('hat-rolle', ['haupt']),
            mockMitglied('bot', [], 400, true),
            mockMitglied('schon-mal'),
            mockMitglied('frisch', [], 5),
        ], 'haupt', new Set(['schon-mal']), JETZT);

        expect(empfaenger).toEqual(['passt', 'nur-twitch']);
    });
});

describe('RollenDmHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(JETZT);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        rollenDm.getWarteschlange.mockResolvedValue([]);
        rollenDm.getAngeschrieben.mockResolvedValue([]);
        rollenDm.markiereAngeschrieben.mockResolvedValue(true);
        hinweis.getHauptrolle.mockResolvedValue('haupt');
        hinweis.getRollenKanal.mockResolvedValue('kanal-rollen');
        sendeDm.mockResolvedValue(true);
        guildsCache.clear();
        guildsCache.set(config.GUILD_ID, mockGuild([mockMitglied('a'), mockMitglied('b'), mockMitglied('c', ['haupt'])]));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('sendeNaechste', () => {
        it('schreibt ohne gestartete Runde niemanden an', async () => {
            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('schreibt außerhalb der Versandzeit niemanden an', async () => {
            vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
            rollenDm.getWarteschlange.mockResolvedValue(['a']);

            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('schreibt pro Durchlauf genau eine Person an', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a', 'b']);

            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).toHaveBeenCalledTimes(1);
            expect(sendeDm).toHaveBeenCalledWith('a', expect.stringContaining(`/channels/${config.GUILD_ID}/kanal-rollen`), 'Rollen-Erinnerung');
            expect(rollenDm.ausWarteschlange).toHaveBeenCalledWith('a');
            expect(rollenDm.ausWarteschlange).not.toHaveBeenCalledWith('b');
        });

        it('überspringt, wer die Rolle inzwischen hat oder weg ist, und nimmt die nächste Person', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['c', 'weg', 'a']);

            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).toHaveBeenCalledTimes(1);
            expect(sendeDm.mock.calls[0]).toContain('a');
            expect(rollenDm.ausWarteschlange).toHaveBeenCalledWith('c');
            expect(rollenDm.ausWarteschlange).toHaveBeenCalledWith('weg');
        });

        // Früher galt jeder Fehler als "weg": eine kurze Störung hätte die ganze Runde still geleert.
        it('verliert bei einem vorübergehenden Fehler niemanden und sagt im Log warum', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a', 'b']);
            const guild = mockGuild([mockMitglied('a'), mockMitglied('b')]);
            guild.members.fetch.mockRejectedValue(new Error('socket hang up'));
            guildsCache.set(config.GUILD_ID, guild);

            await rollenDmHandler.sendeNaechste();

            expect(rollenDm.ausWarteschlange).not.toHaveBeenCalled();
            expect(rollenDm.markiereAngeschrieben).not.toHaveBeenCalled();
            expect(sendeDm).not.toHaveBeenCalled();
            // Nach dem ersten Fehler ist Schluss, statt die Störung an allen Weiteren auszuprobieren.
            expect(guild.members.fetch).toHaveBeenCalledTimes(1);
            expect(console.warn).toHaveBeenCalledWith(
                'Rollen-DM-Runde: Mitglied a nicht abrufbar, Versuch in 10 Minuten wieder: socket hang up');
        });

        it('protokolliert jede DM mit ID und Rest, nie mit Text', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a', 'b']);

            await rollenDmHandler.sendeNaechste();

            expect(console.log).toHaveBeenCalledWith('Rollen-Erinnerung an a zugestellt, noch 1 in der Warteschlange.');
        });

        it('meldet das Ende der Runde', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a']);
            sendeDm.mockResolvedValue(false);

            await rollenDmHandler.sendeNaechste();

            expect(console.log).toHaveBeenCalledWith('Rollen-Erinnerung an a nicht zustellbar, Runde abgeschlossen.');
        });

        it('meldet, wenn nur noch Übersprungene in der Warteschlange standen', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['c', 'weg']);

            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('Rollen-Erinnerung: c hat die Hauptrolle inzwischen, übersprungen.');
            expect(console.log).toHaveBeenCalledWith('Rollen-Erinnerung: weg ist nicht mehr auf dem Server, übersprungen.');
            expect(console.log).toHaveBeenCalledWith('Rollen-DM-Runde abgeschlossen: niemand mehr in der Warteschlange.');
        });

        it('schreibt niemanden doppelt an', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a']);
            rollenDm.markiereAngeschrieben.mockResolvedValue(false);

            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('vermerkt geschlossene DMs und versucht es nicht erneut', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a']);
            sendeDm.mockResolvedValue(false);

            await rollenDmHandler.sendeNaechste();

            expect(rollenDm.markiereNichtZugestellt).toHaveBeenCalledWith('a');
            expect(rollenDm.markiereAngeschrieben).toHaveBeenCalledWith('a');
        });

        it('pausiert, wenn die Hauptrolle fehlt, und behält die Warteschlange', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a']);
            hinweis.getHauptrolle.mockResolvedValue(null);

            await rollenDmHandler.sendeNaechste();

            expect(sendeDm).not.toHaveBeenCalled();
            expect(rollenDm.ausWarteschlange).not.toHaveBeenCalled();
        });
    });

    describe('starte', () => {
        it('füllt nur die Warteschlange und sendet selbst nichts', async () => {
            rollenDm.getWarteschlange.mockResolvedValue(['a', 'b']);

            expect(await rollenDmHandler.starte('admin-1')).toBe(2);

            expect(rollenDm.inWarteschlange.mock.calls.map(aufruf => aufruf[0])).toEqual(['a', 'b']);
            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('meldet die tatsächliche Zahl aus der Warteschlange und wer gestartet hat', async () => {
            // Ein zweiter Start nach einem Teil-Lauf: x stand schon drin, a und b kommen dazu.
            rollenDm.getWarteschlange.mockResolvedValue(['x', 'a', 'b']);

            expect(await rollenDmHandler.starte('admin-1')).toBe(3);
            expect(console.log).toHaveBeenCalledWith(
                'Rollen-DM-Runde gestartet von admin-1: 2 neu in der Warteschlange, 3 insgesamt ausstehend.');
        });

        it('startet ohne Rollen-Kanal nicht', async () => {
            hinweis.getRollenKanal.mockResolvedValue(null);

            expect(await rollenDmHandler.starte('admin-1')).toBeNull();
            expect(rollenDm.inWarteschlange).not.toHaveBeenCalled();
        });
    });

    it('brichAb leert die Warteschlange und sagt im Log, wer wie viele DMs gestoppt hat', async () => {
        rollenDm.getWarteschlange.mockResolvedValue(['a', 'b']);

        await rollenDmHandler.brichAb('admin-1');

        expect(rollenDm.leereWarteschlange).toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith('Rollen-DM-Runde abgebrochen von admin-1: 2 DMs gehen nicht mehr raus.');
    });

    it('holeStand zeigt Vorschau und Zähler', async () => {
        rollenDm.getWarteschlange.mockResolvedValue(['a']);
        rollenDm.getAngeschrieben.mockResolvedValue(['b']);
        rollenDm.getNichtZugestellt.mockResolvedValue(['b']);

        const stand = await rollenDmHandler.holeStand();

        expect(stand).toMatchObject({wuerdenAngeschrieben: 1, ausstehend: 1, angeschrieben: 1, nichtZugestellt: 1});
        expect(stand.text).toContain('Einwohner');
    });
});
