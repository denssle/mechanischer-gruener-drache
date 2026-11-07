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

import {Collection} from 'discord.js';
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
                if (!karte.has(id)) throw new Error('Unknown Member');
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

        expect(text).toContain('„Testserver"');
        expect(text).toContain('„Einwohner"');
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
            expect(await rollenDmHandler.starte()).toBe(true);

            expect(rollenDm.inWarteschlange.mock.calls.map(aufruf => aufruf[0])).toEqual(['a', 'b']);
            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('startet ohne Rollen-Kanal nicht', async () => {
            hinweis.getRollenKanal.mockResolvedValue(null);

            expect(await rollenDmHandler.starte()).toBe(false);
            expect(rollenDm.inWarteschlange).not.toHaveBeenCalled();
        });
    });

    it('brichAb leert die Warteschlange', async () => {
        await rollenDmHandler.brichAb();

        expect(rollenDm.leereWarteschlange).toHaveBeenCalled();
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
