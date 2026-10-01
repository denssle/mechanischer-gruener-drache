import {describe, it, expect, vi, beforeEach} from 'vitest';
import {MessageFlags} from 'discord.js';

vi.mock("../services/redis.service.js", () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        getSortedSet: vi.fn(),
        setSortedSet: vi.fn(),
        getTimeToLive: vi.fn(),
        getSortedSetAll: vi.fn(),
        setWithExpiry: vi.fn(),
        setIfAbsent: vi.fn(),
        increment: vi.fn(),
        delete: vi.fn(),
    },
    REDIS_KEYS: {
        PING_PONG: "PING_PONG"
    }
}));

vi.mock("../services/user.service.js", () => ({
    default: {
        getUser: vi.fn(),
    }
}));

// pingPongSeason.handler stellt nur formatMonat/monatsSchluessel für die Bestenlisten-Überschrift -
// mocken, damit dieser Test nicht client/config mitziehen muss.
vi.mock("./pingPongSeason.handler.js", () => ({
    default: {},
    formatMonat: (schluessel: string) => `Monat ${schluessel}`,
    monatsSchluessel: () => '2026-07',
}));

// greeting.handler liefert das persönliche Morgengruß-Emoji für die Bestenliste - mocken, damit
// dieser Test nicht client (via greeting.handler) mitziehen muss. emojiFuerNachricht reicht den
// Wert durch (die echte Auflösung testet greeting.handler.test.ts).
vi.mock("./greeting.handler.js", () => ({
    default: {
        holePersoenlicheEmojis: vi.fn(async (ids: string[]) =>
            Object.fromEntries(ids.map(id => [id, '🌞']))),
    },
    emojiFuerNachricht: (wert: string) => wert,
}));

import redisService from "../services/redis.service.js";
import userService from "../services/user.service.js";
import greetingHandler from "./greeting.handler.js";
import pingPongHandler, {
    DUELL_FLAVORS,
    entscheideTaktik,
    formatDoppelZeilen,
    loseTeams,
    parseDoppelLobby,
    formatAnsage,
    formatDelta,
    formatSerie,
    formatTeilnehmerZeile,
    MAX_RUNDLAUF,
    MIN_RUNDLAUF,
    MIN_SERIE,
    parseTeilnehmer,
    randomDuellFlavor,
    rundlaufPunkte,
    spieleDuell,
    spieleRundlauf,
    TAKTIK_AKTIONEN
} from "./pingPong.handler.js";

describe('PingPongHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // clearAllMocks leert nur die Aufrufe, nicht die Implementierungen - die Defaults hier
        // setzen, sonst schleppt ein Test seine mockRejectedValue/mockImplementation in den nächsten.
        vi.mocked(redisService.get).mockResolvedValue(null);
        vi.mocked(redisService.set).mockImplementation(async (_key: string, value: string) => value);
        // Standard: kein aktiver Cooldown (Redis liefert -2 wenn der Key nicht existiert).
        vi.mocked(redisService.getTimeToLive).mockResolvedValue(-2);
        // Standard: erste Siegesserie (INCR auf einem noch nicht existierenden Key gibt 1).
        vi.mocked(redisService.increment).mockResolvedValue(1);
        // Standard: der Doppel-Start-Lock ist frei.
        vi.mocked(redisService.setIfAbsent).mockResolvedValue(true);
    });

    describe('Flavor-Text', () => {
        it('randomDuellFlavor liefert immer eine Zeile aus DUELL_FLAVORS', () => {
            for (let i = 0; i < 50; i++) {
                expect(DUELL_FLAVORS).toContain(randomDuellFlavor());
            }
        });
    });

    describe('spieleDuell', () => {
        it('endet immer damit, dass genau einer 3 Ballwechsel gewonnen hat', () => {
            for (let i = 0; i < 200; i++) {
                const {herausfordererPunkte, gegnerPunkte} = spieleDuell();

                expect(Math.max(herausfordererPunkte, gegnerPunkte)).toBe(3);
                expect(Math.min(herausfordererPunkte, gegnerPunkte)).toBeLessThan(3);
                expect(herausfordererPunkte).not.toBe(gegnerPunkte);
            }
        });

        it('lässt den Herausforderer gewinnen, wenn jeder Ballwechsel an ihn geht', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4);

            expect(spieleDuell()).toEqual({herausfordererPunkte: 3, gegnerPunkte: 0});
        });
    });

    describe('handleHerausfordern', () => {
        const mockInteraction = (gegner: any) => ({
            user: {id: 'user-a'},
            options: {getUser: vi.fn().mockReturnValue(gegner)},
            reply: vi.fn(),
        } as any);

        it('postet die Herausforderung mit Annehmen- und Ablehnen-Button', async () => {
            const interaction = mockInteraction({id: 'user-b', bot: false});

            await pingPongHandler.handleHerausfordern(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('<@user-a>');
            expect(reply.content).toContain('<@user-b>');

            const buttons = reply.components[0].toJSON().components;
            expect(buttons.map((b: any) => b.custom_id)).toEqual([
                'pingpong-duell:annehmen:user-a:user-b',
                'pingpong-duell:ablehnen:user-a:user-b',
            ]);
            expect(redisService.setWithExpiry).toHaveBeenCalledWith('PING_PONG:COOLDOWN:user-a', '1', 30);
        });

        it('lehnt eine Herausforderung gegen sich selbst ab', async () => {
            const interaction = mockInteraction({id: 'user-a', bot: false});

            await pingPongHandler.handleHerausfordern(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });

        it('lehnt eine Herausforderung gegen einen Bot ab', async () => {
            const interaction = mockInteraction({id: 'bot-1', bot: true});

            await pingPongHandler.handleHerausfordern(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });

        it('blockt während eines aktiven Cooldowns', async () => {
            vi.mocked(redisService.getTimeToLive).mockResolvedValue(9);
            const interaction = mockInteraction({id: 'user-b', bot: false});

            await pingPongHandler.handleHerausfordern(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('9s'),
                flags: MessageFlags.Ephemeral,
            }));
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });
    });

    describe('formatAnsage', () => {
        it('schweigt beim normalen Duell', () => {
            expect(formatAnsage(false, 'user-a', true)).toBeNull();
        });

        it('formuliert erfüllte und blamierte Ansage', () => {
            expect(formatAnsage(true, 'user-a', true)).toContain('Ansage erfüllt');
            expect(formatAnsage(true, 'user-a', false)).toContain('Große Klappe');
        });
    });

    describe('handleAnsageduell', () => {
        const mockInteraction = (gegner: any) => ({
            user: {id: 'user-a'},
            options: {getUser: vi.fn().mockReturnValue(gegner)},
            reply: vi.fn(),
        } as any);

        it('postet die Herausforderung mit dem Ansage-Prefix in der customId', async () => {
            const interaction = mockInteraction({id: 'user-b', bot: false});

            await pingPongHandler.handleAnsageduell(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('eigenen Sieg');

            const buttons = reply.components[0].toJSON().components;
            expect(buttons.map((b: any) => b.custom_id)).toEqual([
                'pingpong-ansage:annehmen:user-a:user-b',
                'pingpong-ansage:ablehnen:user-a:user-b',
            ]);
            expect(redisService.setWithExpiry).toHaveBeenCalledWith('PING_PONG:COOLDOWN:user-a', '1', 30);
        });

        it('teilt sich den Cooldown mit dem normalen Duell', async () => {
            vi.mocked(redisService.getTimeToLive).mockResolvedValue(12);
            const interaction = mockInteraction({id: 'user-b', bot: false});

            await pingPongHandler.handleAnsageduell(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('12s'),
                flags: MessageFlags.Ephemeral,
            }));
        });

        it('lehnt Bots und sich selbst ab', async () => {
            await pingPongHandler.handleAnsageduell(mockInteraction({id: 'user-a', bot: false}));
            await pingPongHandler.handleAnsageduell(mockInteraction({id: 'bot-1', bot: true}));

            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });
    });

    describe('handleDuellButton', () => {
        const mockButton = (customId: string, userId: string) => ({
            customId,
            user: {id: userId},
            update: vi.fn(),
            reply: vi.fn().mockResolvedValue(undefined),
            replied: false,
        } as any);

        // updateScore liest den neuen Stand aus der Antwort von redisService.set.
        const scoresInRedis = (scores: Record<string, string>) => {
            vi.mocked(redisService.get).mockImplementation(async (key: string) => scores[key] ?? null as any);
            vi.mocked(redisService.set).mockImplementation(async (_key: string, value: string) => value as any);
        };

        it('ignoriert Buttons mit fremdem Prefix', async () => {
            const interaction = mockButton('role-toggle:123', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(interaction.update).not.toHaveBeenCalled();
            expect(interaction.reply).not.toHaveBeenCalled();
        });

        it('lässt nur den Herausgeforderten entscheiden', async () => {
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-c');

            await pingPongHandler.handleDuellButton(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            expect(interaction.update).not.toHaveBeenCalled();
            expect(redisService.set).not.toHaveBeenCalled();
        });

        it('entfernt beim Ablehnen die Buttons und vergibt keine Punkte', async () => {
            const interaction = mockButton('pingpong-duell:ablehnen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('lehnt die Herausforderung'),
                components: [],
            }));
            expect(redisService.set).not.toHaveBeenCalled();
        });

        it('gibt dem Sieger einen Punkt und zieht dem Verlierer einen ab', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4); // jeder Ballwechsel geht an den Herausforderer
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '11');
            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '3');
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG', 'user-a', 11);
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG', 'user-b', 3);

            const update = interaction.update.mock.calls[0][0];
            expect(update.content).toContain('<@user-a> gewinnt 3:0 gegen <@user-b>');
            expect(update.components).toEqual([]);
        });

        it('gibt dem Herausforderer einen Extra-Punkt, wenn seine Ansage aufgeht', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4); // Herausforderer gewinnt
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-ansage:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            // 10 + 1 (Sieg) + 1 (erfüllte Ansage)
            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '12');
            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '3');
            expect(interaction.update.mock.calls[0][0].content).toContain('Ansage erfüllt');
        });

        it('zieht dem Herausforderer bei blamierter Ansage einen zweiten Punkt ab', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9); // Gegner gewinnt
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-ansage:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            // 10 - 1 (Niederlage) - 1 (blamierte Ansage) = 8
            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '8');
            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '5');
            expect(interaction.update.mock.calls[0][0].content).toContain('Große Klappe');
        });

        it('spielt auch mit dem Ansage-Malus niemanden ins Minus', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9); // Gegner gewinnt
            scoresInRedis({'user-aPING_PONG': '1', 'user-bPING_PONG': '0'});
            const interaction = mockButton('pingpong-ansage:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            // 1 - 1 - 1 wäre -1, der Clamp fängt das ab
            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '0');
        });

        it('erwähnt beim normalen Duell keine Ansage', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4);
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(interaction.update.mock.calls[0][0].content).not.toContain('Ansage');
        });

        it('hängt die Siegesserie ans Ergebnis, sobald sie läuft', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4);
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            vi.mocked(redisService.increment).mockResolvedValue(3);
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(interaction.update.mock.calls[0][0].content).toContain('**3 Duelle in Folge**');
        });

        it('zieht den Verlierer nicht unter 0 Punkte', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4);
            scoresInRedis({'user-aPING_PONG': '1', 'user-bPING_PONG': '0'});
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '0');
        });

        it('fängt Fehler ab', async () => {
            vi.mocked(redisService.get).mockRejectedValue(new Error('Redis kaputt'));
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
        });
    });

    describe('formatSerie', () => {
        const stand = (overrides: any) => ({
            siegerId: 'user-a',
            verliererId: 'user-b',
            serie: 1,
            istNeuerRekord: false,
            beendeteSerie: 0,
            pechstraehne: 1,
            istNeuerPechRekord: false,
            beendetePechstraehne: 0,
            ...overrides,
        });

        it('schweigt beim ersten Sieg ohne beendete Gegenserie', () => {
            expect(formatSerie(stand({}))).toBeNull();
        });

        it('nennt die laufende Serie ab zwei Siegen', () => {
            expect(formatSerie(stand({serie: 3}))).toBe('<@user-a> ist jetzt **3 Duelle in Folge** ungeschlagen.');
        });

        it('weist auf einen neuen persönlichen Rekord hin', () => {
            expect(formatSerie(stand({serie: 4, istNeuerRekord: true}))).toContain('neuer persönlicher Rekord');
        });

        it('erwähnt die abgerissene Serie des Verlierers', () => {
            const text = formatSerie(stand({serie: 2, beendeteSerie: 5}));

            expect(text).toContain('<@user-a> ist jetzt **2 Duelle in Folge** ungeschlagen.');
            expect(text).toContain('Die Serie von <@user-b> endet nach **5 Siegen**.');
        });

        it('ignoriert eine beendete Serie von nur einem Sieg', () => {
            expect(formatSerie(stand({beendeteSerie: 1}))).toBeNull();
        });

        it('nennt die Pechsträhne des Verlierers ab zwei Niederlagen', () => {
            expect(formatSerie(stand({pechstraehne: 3}))).toBe('<@user-b> hat jetzt **3 Duelle in Folge** verloren.');
        });

        it('weist auf eine Rekord-Pechsträhne hin', () => {
            expect(formatSerie(stand({pechstraehne: 4, istNeuerPechRekord: true}))).toContain('noch nie');
        });

        it('erwähnt die Pechsträhne, die der Sieger beendet', () => {
            expect(formatSerie(stand({beendetePechstraehne: 6})))
                .toBe('<@user-a> beendet eine Pechsträhne von **6 Niederlagen**.');
        });

        it('ignoriert eine beendete Pechsträhne von nur einer Niederlage', () => {
            expect(formatSerie(stand({beendetePechstraehne: 1}))).toBeNull();
        });
    });

    describe('verarbeiteSerie', () => {
        it('zählt den Sieger hoch, löscht die Serie des Verlierers und schreibt den Rekord fort', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(3);
            vi.mocked(redisService.get).mockImplementation(async (key: string) => ({
                'PING_PONG:SERIE:user-b': '5',
                'PING_PONG:REKORD:user-a': '2',
            } as Record<string, string>)[key] ?? null);

            const stand = await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.increment).toHaveBeenCalledWith('PING_PONG:SERIE:user-a');
            expect(redisService.delete).toHaveBeenCalledWith('PING_PONG:SERIE:user-b');
            expect(redisService.set).toHaveBeenCalledWith('PING_PONG:REKORD:user-a', '3');
            expect(stand).toMatchObject({
                siegerId: 'user-a',
                verliererId: 'user-b',
                serie: 3,
                istNeuerRekord: true,
                beendeteSerie: 5,
            });
        });

        it('lässt einen bestehenden höheren Rekord unangetastet', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(2);
            vi.mocked(redisService.get).mockImplementation(async (key: string) =>
                key === 'PING_PONG:REKORD:user-a' ? '7' : null);

            const stand = await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(stand.istNeuerRekord).toBe(false);
            expect(redisService.set).not.toHaveBeenCalledWith('PING_PONG:REKORD:user-a', expect.anything());
        });

        it('meldet den ersten Sieg nicht als Rekord', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(1);
            vi.mocked(redisService.get).mockResolvedValue(null);

            const stand = await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            // Gespeichert wird die 1 trotzdem, nur erzählt wird sie nicht.
            expect(redisService.set).toHaveBeenCalledWith('PING_PONG:REKORD:user-a', '1');
            expect(stand.istNeuerRekord).toBe(false);
        });

        it('zählt die Pechsträhne des Verlierers hoch und beendet die des Siegers', async () => {
            vi.mocked(redisService.increment).mockImplementation(async (key: string) =>
                key === 'PING_PONG:PECHSTRAEHNE:user-b' ? 4 : 1);
            vi.mocked(redisService.get).mockImplementation(async (key: string) => ({
                'PING_PONG:PECHSTRAEHNE:user-a': '3',
                'PING_PONG:PECHREKORD:user-b': '2',
            } as Record<string, string>)[key] ?? null);

            const stand = await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.increment).toHaveBeenCalledWith('PING_PONG:PECHSTRAEHNE:user-b');
            expect(redisService.delete).toHaveBeenCalledWith('PING_PONG:PECHSTRAEHNE:user-a');
            expect(redisService.set).toHaveBeenCalledWith('PING_PONG:PECHREKORD:user-b', '4');
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG:PECHREKORD_HIGHSCORE', 'user-b', 4);
            expect(stand).toMatchObject({pechstraehne: 4, istNeuerPechRekord: true, beendetePechstraehne: 3});
        });

        it('schreibt auch ohne neuen Pech-Rekord den bestehenden Stand in die Rangliste', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(2);
            vi.mocked(redisService.get).mockImplementation(async (key: string) =>
                key === 'PING_PONG:PECHREKORD:user-b' ? '8' : null);

            const stand = await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.set).not.toHaveBeenCalledWith('PING_PONG:PECHREKORD:user-b', expect.anything());
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG:PECHREKORD_HIGHSCORE', 'user-b', 8);
            expect(stand.istNeuerPechRekord).toBe(false);
        });

        it('löscht nichts, wenn der Verlierer gar keine Serie hatte', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.delete).not.toHaveBeenCalled();
        });

        it('schreibt den neuen Rekord auch in die Rangliste', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(4);
            vi.mocked(redisService.get).mockImplementation(async (key: string) =>
                key === 'PING_PONG:REKORD:user-a' ? '2' : null);

            await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG:REKORD_HIGHSCORE', 'user-a', 4);
        });

        // Der Kern der lazy Nachwanderung: das Sorted Set kam nach den Einzelkeys dazu, deshalb
        // wird auch OHNE neuen Rekord der bestehende Wert hineingeschrieben. Ohne das müsste man
        // die Bestandsrekorde per SCAN migrieren - oder sie blieben für immer unsichtbar.
        it('schreibt auch ohne neuen Rekord den bestehenden Stand in die Rangliste', async () => {
            vi.mocked(redisService.increment).mockResolvedValue(2);
            vi.mocked(redisService.get).mockImplementation(async (key: string) =>
                key === 'PING_PONG:REKORD:user-a' ? '9' : null);

            await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.set).not.toHaveBeenCalledWith('PING_PONG:REKORD:user-a', expect.anything());
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG:REKORD_HIGHSCORE', 'user-a', 9);
        });
    });

    describe('handleSerienrekorde', () => {
        const interaction = () => ({reply: vi.fn(), guild: {}} as any);

        it('listet die Rekorde absteigend mit Emoji und ohne Mentions', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                {value: 'user-a', score: 7},
                {value: 'user-b', score: 4},
            ] as any);
            vi.mocked(userService.getUser).mockImplementation(async (id: string) =>
                ({displayName: id === 'user-a' ? 'Tirsis' : 'Acaine'} as any));

            const inter = interaction();
            await pingPongHandler.handleSerienrekorde(inter);

            const antwort = inter.reply.mock.calls[0][0];
            expect(antwort.content).toContain('1. 🌞 Tirsis - **7** Siege in Folge');
            expect(antwort.content).toContain('2. 🌞 Acaine - **4** Siege in Folge');
            // Pflicht: der displayName ist selbst gewählt, ein `<@…>` darin würde sonst pingen.
            expect(antwort.allowedMentions).toEqual({parse: []});
        });

        // Eine "Serie" von 1 hat jede Person mit einem einzigen Sieg - das wären dieselben
        // Karteileichen wie die 0-Punkte-Einträge in der Bestenliste.
        // Die Grenze ist EINSCHLIESSEND (>= MIN_SERIE): eine Serie von genau 2 gehört in die
        // Liste, nur die 1 fliegt raus. Der Leer-Text sagt das auch so ("mindestens 2") - er
        // behauptete zwischenzeitlich "über 2" und war damit um eins daneben.
        it('nimmt eine Serie von genau der Mindestlänge auf und lässt nur kürzere weg', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                {value: 'user-a', score: MIN_SERIE},
                {value: 'user-b', score: MIN_SERIE - 1},
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue({displayName: 'Tirsis'} as any);

            const inter = interaction();
            await pingPongHandler.handleSerienrekorde(inter);

            const content = inter.reply.mock.calls[0][0].content;
            expect(content).toContain(`1. 🌞 Tirsis - **${MIN_SERIE}** Siege in Folge`);
            expect(content).not.toContain('2.');
        });

        it('meldet eine leere Rangliste, statt eine leere Liste zu posten', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([{value: 'user-a', score: 1}] as any);

            const inter = interaction();
            await pingPongHandler.handleSerienrekorde(inter);

            expect(inter.reply.mock.calls[0][0].content).toContain('Noch keine Serie');
        });

        it('antwortet ephemer, wenn der Abruf scheitert', async () => {
            vi.mocked(redisService.getSortedSet).mockRejectedValue(new Error('Redis weg'));

            const inter = interaction();
            await pingPongHandler.handleSerienrekorde(inter);

            expect(inter.reply).toHaveBeenCalledWith({
                content: 'Die Serienrekorde konnten nicht abgerufen werden.',
                flags: MessageFlags.Ephemeral,
            });
        });
    });

    // Dieselbe Anzeige wie handleSerienrekorde (zeigeSerienRangliste), nur aus der Pech-Rangliste.
    describe('handlePechstraehnen', () => {
        const interaction = () => ({reply: vi.fn(), guild: {}} as any);

        it('listet die Pechsträhnen aus der eigenen Rangliste, ohne Mentions', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                {value: 'user-a', score: 5},
                {value: 'user-b', score: 1},
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue({displayName: 'Tirsis'} as any);

            const inter = interaction();
            await pingPongHandler.handlePechstraehnen(inter);

            expect(redisService.getSortedSet).toHaveBeenCalledWith('PING_PONG:PECHREKORD_HIGHSCORE');
            const antwort = inter.reply.mock.calls[0][0];
            expect(antwort.content).toContain('Längste Pechsträhnen');
            expect(antwort.content).toContain('1. 🌞 Tirsis - **5** Niederlagen in Folge');
            // Unter MIN_SERIE fliegt raus wie bei den Siegesserien.
            expect(antwort.content).not.toContain('2.');
            expect(antwort.allowedMentions).toEqual({parse: []});
        });

        it('meldet eine leere Rangliste', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([]);

            const inter = interaction();
            await pingPongHandler.handlePechstraehnen(inter);

            expect(inter.reply.mock.calls[0][0].content).toContain(`Noch niemand hat ${MIN_SERIE} Duelle in Folge verloren`);
        });

        it('antwortet ephemer, wenn der Abruf scheitert', async () => {
            vi.mocked(redisService.getSortedSet).mockRejectedValue(new Error('Redis weg'));

            const inter = interaction();
            await pingPongHandler.handlePechstraehnen(inter);

            expect(inter.reply).toHaveBeenCalledWith({
                content: 'Die Pechsträhnen konnten nicht abgerufen werden.',
                flags: MessageFlags.Ephemeral,
            });
        });
    });

    describe('entscheideTaktik', () => {
        it('lässt Schmetterball → Lupfer → Konter → Schmetterball übertrumpfen', () => {
            expect(entscheideTaktik('schmetterball', 'lupfer')).toBe('herausforderer');
            expect(entscheideTaktik('lupfer', 'konter')).toBe('herausforderer');
            expect(entscheideTaktik('konter', 'schmetterball')).toBe('herausforderer');
        });

        it('gibt dem Gegner den Sieg in der Gegenrichtung', () => {
            expect(entscheideTaktik('lupfer', 'schmetterball')).toBe('gegner');
            expect(entscheideTaktik('konter', 'lupfer')).toBe('gegner');
            expect(entscheideTaktik('schmetterball', 'konter')).toBe('gegner');
        });

        it('meldet ein Patt bei gleicher Aktion', () => {
            TAKTIK_AKTIONEN.forEach(aktion => {
                expect(entscheideTaktik(aktion, aktion)).toBe('gleich');
            });
        });
    });

    describe('handleTaktikduell', () => {
        const mockInteraction = (gegner: any, aktion: string) => ({
            user: {id: 'user-a'},
            options: {
                getUser: vi.fn().mockReturnValue(gegner),
                getString: vi.fn().mockReturnValue(aktion),
            },
            reply: vi.fn(),
        } as any);

        it('postet drei Aktions-Buttons plus Ablehnen, mit der eigenen Aktion in der customId', async () => {
            const interaction = mockInteraction({id: 'user-b', bot: false}, 'konter');

            await pingPongHandler.handleTaktikduell(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            const buttons = reply.components[0].toJSON().components;

            expect(buttons.map((b: any) => b.custom_id)).toEqual([
                'pingpong-taktik:schmetterball:user-a:user-b:konter',
                'pingpong-taktik:konter:user-a:user-b:konter',
                'pingpong-taktik:lupfer:user-a:user-b:konter',
                'pingpong-taktik:ablehnen:user-a:user-b:konter',
            ]);
            // Die verdeckte Wahl darf nicht im sichtbaren Text stehen.
            expect(reply.content).not.toContain('Konter**:');
            expect(redisService.setWithExpiry).toHaveBeenCalledWith('PING_PONG:COOLDOWN:user-a', '1', 30);
        });

        it('lehnt Bots, sich selbst und aktive Cooldowns ab', async () => {
            await pingPongHandler.handleTaktikduell(mockInteraction({id: 'user-a', bot: false}, 'konter'));
            await pingPongHandler.handleTaktikduell(mockInteraction({id: 'bot-1', bot: true}, 'konter'));

            vi.mocked(redisService.getTimeToLive).mockResolvedValue(7);
            await pingPongHandler.handleTaktikduell(mockInteraction({id: 'user-b', bot: false}, 'konter'));

            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });
    });

    describe('handleTaktikButton', () => {
        const mockButton = (customId: string, userId: string) => ({
            customId,
            user: {id: userId},
            update: vi.fn(),
            reply: vi.fn().mockResolvedValue(undefined),
            replied: false,
        } as any);

        const scoresInRedis = (scores: Record<string, string>) => {
            vi.mocked(redisService.get).mockImplementation(async (key: string) => scores[key] ?? null as any);
            vi.mocked(redisService.set).mockImplementation(async (_key: string, value: string) => value as any);
        };

        it('ignoriert Buttons mit fremdem Prefix', async () => {
            const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', 'user-b');

            await pingPongHandler.handleTaktikButton(interaction);

            expect(interaction.update).not.toHaveBeenCalled();
        });

        it('lässt nur den Herausgeforderten wählen', async () => {
            const interaction = mockButton('pingpong-taktik:konter:user-a:user-b:lupfer', 'user-c');

            await pingPongHandler.handleTaktikButton(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            expect(interaction.update).not.toHaveBeenCalled();
        });

        it('entfernt beim Ablehnen die Buttons und vergibt keine Punkte', async () => {
            const interaction = mockButton('pingpong-taktik:ablehnen:user-a:user-b:lupfer', 'user-b');

            await pingPongHandler.handleTaktikButton(interaction);

            expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({components: []}));
            expect(redisService.set).not.toHaveBeenCalled();
        });

        it('lässt die stärkere Aktion gewinnen und deckt beide Wahlen auf', async () => {
            scoresInRedis({'user-aPING_PONG': '5', 'user-bPING_PONG': '5'});
            // Herausforderer: Lupfer, Gegner: Konter -> Lupfer übertrumpft Konter
            const interaction = mockButton('pingpong-taktik:konter:user-a:user-b:lupfer', 'user-b');

            await pingPongHandler.handleTaktikButton(interaction);

            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '6');
            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '4');

            const content = interaction.update.mock.calls[0][0].content;
            expect(content).toContain('<@user-a>: **Lupfer**');
            expect(content).toContain('<@user-b>: **Konter**');
            expect(content).toContain('**Lupfer** übertrumpft **Konter**');
            expect(content).toContain('<@user-a> gewinnt gegen <@user-b>');
        });

        it('lässt bei gleicher Aktion den Ballwechsel entscheiden', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4); // jeder Ballwechsel an den Herausforderer
            scoresInRedis({'user-aPING_PONG': '5', 'user-bPING_PONG': '5'});
            const interaction = mockButton('pingpong-taktik:konter:user-a:user-b:konter', 'user-b');

            await pingPongHandler.handleTaktikButton(interaction);

            const content = interaction.update.mock.calls[0][0].content;
            expect(content).toContain('Dieselbe Aktion');
            expect(content).toContain('3:0 für <@user-a>');
            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '6');
        });

        it('fängt Fehler ab', async () => {
            vi.mocked(redisService.get).mockRejectedValue(new Error('Redis kaputt'));
            const interaction = mockButton('pingpong-taktik:konter:user-a:user-b:lupfer', 'user-b');

            await pingPongHandler.handleTaktikButton(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
        });
    });

    describe('handleHilfe', () => {
        it('nennt alle Ping-Pong-Befehle', async () => {
            const interaction = {reply: vi.fn()} as any;

            await pingPongHandler.handleHilfe(interaction);

            const text = interaction.reply.mock.calls[0][0];
            expect(text).toContain('/pingpong herausfordern');
            expect(text).toContain('/pingpong ansageduell');
            expect(text).toContain('/pingpong taktikduell');
            expect(text).toContain('/pingpong bestenliste');
            expect(text).toContain('/pingpong hilfe');
        });

        // Die Gruppen-Hilfe wächst mit jedem Modus und hatte bis zur Pechsträhne keinen eigenen
        // Limit-Test (anders als /hilfe) - Discord lehnt längere Nachrichten schlicht ab.
        it('bleibt unter dem Discord-Limit von 2000 Zeichen', async () => {
            const interaction = {reply: vi.fn()} as any;

            await pingPongHandler.handleHilfe(interaction);

            expect(interaction.reply.mock.calls[0][0].length).toBeLessThanOrEqual(2000);
        });
    });

    describe('convertScoreToNumber', () => {
        it('gibt 0 zurück für leeren String', () => {
            expect(pingPongHandler.convertScoreToNumber('')).toBe(0);
        });

        it('gibt 0 zurück für NaN', () => {
            expect(pingPongHandler.convertScoreToNumber('abc')).toBe(0);
        });

        it('konvertiert String zu Number', () => {
            expect(pingPongHandler.convertScoreToNumber('42')).toBe(42);
        });

        it('akzeptiert auch direkte Numbers', () => {
            expect(pingPongHandler.convertScoreToNumber(42)).toBe(42);
        });

        it('gibt 0 zurück für 0', () => {
            expect(pingPongHandler.convertScoreToNumber(0)).toBe(0);
        });
    });

    describe('getScore', () => {
        it('liest den gespeicherten Punktestand', async () => {
            vi.mocked(redisService.get).mockResolvedValue('7');

            expect(await pingPongHandler.getScore('user-1')).toBe(7);
            expect(redisService.set).not.toHaveBeenCalled();
        });

        // Legt den Einzelkey UND den Sorted-Set-Eintrag an - daher stehen frisch Angelegte mit 0 in
        // der Bestenliste, die sie deshalb ausfiltert.
        it('legt einen unbekannten User mit 0 an', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            expect(await pingPongHandler.getScore('neu')).toBe(0);
            expect(redisService.set).toHaveBeenCalledWith('neuPING_PONG', '0');
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG', 'neu', 0);
        });
    });

    describe('handlePingPongHighscore', () => {
        const mockInteraction = () => ({ reply: vi.fn() } as any);

        it('meldet wenn es noch keine Highscores gibt', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([]);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('Noch keine Punkte in dieser Season'));
            expect(userService.getUser).not.toHaveBeenCalled();
        });

        it('formatiert die Highscore-Liste absteigend mit gespeichertem Displaynamen', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 42 },
                { value: 'user-2', score: 10 },
            ] as any);
            vi.mocked(userService.getUser)
                .mockResolvedValueOnce({ displayName: 'Erster' } as any)
                .mockResolvedValueOnce({ displayName: 'Zweiter' } as any);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('1. 🌞 Erster - 42\n2. 🌞 Zweiter - 10');
        });

        // Das persönliche Emoji aus dem Morgengruß steht als Erkennungszeichen vor dem Namen -
        // jede Zeile bekommt das Emoji der jeweiligen Person, nicht irgendeins.
        it('stellt jedem Eintrag das persönliche Morgengruß-Emoji voran', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 42 },
                { value: 'user-2', score: 10 },
            ] as any);
            vi.mocked(userService.getUser)
                .mockResolvedValueOnce({ displayName: 'Erster' } as any)
                .mockResolvedValueOnce({ displayName: 'Zweiter' } as any);
            vi.mocked(greetingHandler.holePersoenlicheEmojis).mockResolvedValueOnce({
                'user-1': '☕',
                'user-2': '🌻',
            });
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('1. ☕ Erster - 42\n2. 🌻 Zweiter - 10');
        });

        // Der Anzeigename kommt aus den gespeicherten Userdaten und wird von jeder Person selbst
        // gesetzt - ein Name wie `<@…>` würde sonst bei jedem Aufruf jemanden anpingen. Hier ist
        // keine einzige Mention gewollt (anders als in der Ruhmeshalle, die dasselbe Muster nutzt).
        it('unterdrückt jede Mention - der Anzeigename ist selbst gewählt', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 3 },
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue({ displayName: '<@everyone-troll>' } as any);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply.mock.calls[0][0].allowedMentions).toEqual({parse: []});
        });

        it('fällt auf die rohe User-ID zurück wenn kein gespeicherter User existiert', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 5 },
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue(null);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('1. 🌞 user-1 - 5');
        });

        // getScore legt jeden Duell-Teilnehmer im Sorted Set an - wer nach dem Season-Reset seine
        // erste Partie verliert, steht dort mit 0. In der Bestenliste hat das nichts zu suchen.
        it('blendet 0-Punkte-Einträge aus', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 3 },
                { value: 'user-2', score: 0 },
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue({ displayName: 'Erster' } as any);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('1. 🌞 Erster - 3');
            expect(interaction.reply.mock.calls[0][0].content).not.toContain('user-2');
        });

        it('meldet eine Season ohne Punkte, auch wenn nur 0-Einträge existieren', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([{ value: 'user-2', score: 0 }] as any);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('Noch keine Punkte in dieser Season'));
            expect(userService.getUser).not.toHaveBeenCalled();
        });

        it('sollte Fehler abfangen', async () => {
            vi.mocked(redisService.getSortedSet).mockRejectedValue(new Error('Redis kaputt'));
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
        });

        it('zeigt eine laufende Siegesserie hinter den Punkten', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 42 },
                { value: 'user-2', score: 10 },
            ] as any);
            vi.mocked(userService.getUser)
                .mockResolvedValueOnce({ displayName: 'Erster' } as any)
                .mockResolvedValueOnce({ displayName: 'Zweiter' } as any);
            // user-1 hat eine Serie von 4, user-2 nur einen einzelnen Sieg (wird nicht gezeigt).
            vi.mocked(redisService.get).mockImplementation(async (key: string) => ({
                'PING_PONG:SERIE:user-1': '4',
                'PING_PONG:SERIE:user-2': '1',
            } as Record<string, string>)[key] ?? null);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('1. 🌞 Erster - 42 (4 in Folge)\n2. 🌞 Zweiter - 10');
        });
    });
    describe('Rundlauf', () => {
        const mockCommand = (userId: string) => ({
            user: {id: userId},
            reply: vi.fn().mockResolvedValue(undefined),
        } as any);

        const mockButton = (customId: string, userId: string, inhalt: string) => ({
            customId,
            user: {id: userId},
            message: {content: inhalt},
            update: vi.fn(),
            reply: vi.fn().mockResolvedValue(undefined),
            replied: false,
        } as any);

        const lobbyInhalt = (teilnehmer: string[]) =>
            pingPongHandler.baueLobbyText('111', teilnehmer);

        // updateScore liest den neuen Stand aus der Antwort von redisService.set.
        const scoresInRedis = (scores: Record<string, string>) => {
            vi.mocked(redisService.get).mockImplementation(async (key: string) => scores[key] ?? null as any);
            vi.mocked(redisService.set).mockImplementation(async (_key: string, value: string) => value as any);
        };

        describe('rundlaufPunkte', () => {
            // Das Beispiel aus der Anforderung: roh 0/1/2/4/5, abzüglich des gerundeten Schnitts (2).
            it('verteilt bei fünf Leuten -2/-1/0/+2/+3', () => {
                expect(rundlaufPunkte(5)).toEqual([-2, -1, 0, 2, 3]);
            });

            it('gibt dem Sieger immer die meisten und dem Erstausgeschiedenen die wenigsten Punkte', () => {
                for (let anzahl = MIN_RUNDLAUF; anzahl <= MAX_RUNDLAUF; anzahl++) {
                    const punkte = rundlaufPunkte(anzahl);

                    expect(punkte).toHaveLength(anzahl);
                    expect(punkte[anzahl - 1]).toBe(Math.max(...punkte));
                    expect(punkte[0]).toBe(Math.min(...punkte));
                    // Aufsteigend: ein späteres Ausscheiden darf nie weniger wert sein.
                    expect([...punkte].sort((a, b) => a - b)).toEqual(punkte);
                }
            });

            // Kern des Balancings: ein Rundlauf darf die Season nicht vollschütten (siehe Kommentar
            // an rundlaufPunkte). Ganzzahlig aufgeht es nicht immer, ±2 sind der akzeptierte Rest.
            it('bleibt in der Summe nahe null', () => {
                for (let anzahl = MIN_RUNDLAUF; anzahl <= MAX_RUNDLAUF; anzahl++) {
                    const summe = rundlaufPunkte(anzahl).reduce((a, b) => a + b, 0);

                    // Mehr als die halbe Teilnehmerzahl kann der Rundungsrest nie sein.
                    expect(Math.abs(summe)).toBeLessThanOrEqual(anzahl / 2);
                }
            });

            it('gibt beiden Finalisten den Bonus gegenüber dem Rest', () => {
                const punkte = rundlaufPunkte(6);

                // Zwischen den regulären Plätzen liegt je 1 Punkt, beim Sprung ins Finale 2.
                expect(punkte[4] - punkte[3]).toBe(2);
                expect(punkte[3] - punkte[2]).toBe(1);
            });
        });

        describe('spieleRundlauf', () => {
            it('scheidet alle bis auf den Sieger aus, jeden genau einmal', () => {
                const teilnehmer = ['a', 'b', 'c', 'd', 'e'];

                const {reihenfolge} = spieleRundlauf(teilnehmer);

                expect(reihenfolge).toHaveLength(5);
                expect([...reihenfolge].sort()).toEqual([...teilnehmer].sort());
            });

            it('entscheidet das Finale per Match - der Sieger hat mehr Ballwechsel', () => {
                const {finalSatz} = spieleRundlauf(['a', 'b', 'c']);

                expect(finalSatz.siegerPunkte).toBeGreaterThan(finalSatz.verliererPunkte);
                expect(finalSatz.siegerPunkte).toBe(3);
            });

            it('kommt auch mit der Mindestbesetzung aus', () => {
                const {reihenfolge} = spieleRundlauf(['a', 'b', 'c']);

                expect(reihenfolge).toHaveLength(3);
            });
        });

        describe('parseTeilnehmer', () => {
            it('liest die Teilnehmerzeile zurück, die formatTeilnehmerZeile geschrieben hat', () => {
                expect(parseTeilnehmer(formatTeilnehmerZeile(['1', '2', '3']))).toEqual(['1', '2', '3']);
            });

            // Der Eröffner wird im Text über der Liste ebenfalls erwähnt - nur die Marker-Zeile zählt.
            it('ignoriert Mentions außerhalb der Teilnehmerzeile', () => {
                expect(parseTeilnehmer(lobbyInhalt(['222']))).toEqual(['222']);
            });

            it('liefert jede ID nur einmal', () => {
                expect(parseTeilnehmer('An der Platte (2): <@7> <@7>')).toEqual(['7']);
            });

            it('liefert eine leere Liste, wenn die Zeile fehlt', () => {
                expect(parseTeilnehmer('Irgendeine andere Nachricht mit <@7>')).toEqual([]);
            });
        });

        describe('formatDelta', () => {
            it('zeigt das Vorzeichen an, die Null als ±0', () => {
                expect(formatDelta(3)).toBe('+3');
                expect(formatDelta(-2)).toBe('-2');
                expect(formatDelta(0)).toBe('±0');
            });
        });

        describe('handleRundlauf', () => {
            it('eröffnet die Lobby mit dem Eröffner an der Platte', async () => {
                const interaction = mockCommand('111');

                await pingPongHandler.handleRundlauf(interaction);

                const antwort = interaction.reply.mock.calls[0][0];
                expect(parseTeilnehmer(antwort.content)).toEqual(['111']);
                expect(antwort.components).toHaveLength(1);
            });

            // Der Cooldown ist derselbe Key wie bei den Duellen - sonst ließe sich abwechselnd spammen.
            it('greift den Duell-Cooldown ab', async () => {
                vi.mocked(redisService.getTimeToLive).mockResolvedValue(12);
                const interaction = mockCommand('111');

                await pingPongHandler.handleRundlauf(interaction);

                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
                expect(interaction.reply.mock.calls[0][0].content).toContain('12s');
            });
        });

        describe('handleRundlaufButton', () => {
            it('ignoriert Buttons mit fremdem Prefix', async () => {
                const interaction = mockButton('pingpong-duell:annehmen:user-a:user-b', '222', '');

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply).not.toHaveBeenCalled();
            });

            it('stellt eine beitretende Person hinten an die Platte', async () => {
                const interaction = mockButton('pingpong-rundlauf:beitreten:111', '222', lobbyInhalt(['111']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(parseTeilnehmer(interaction.update.mock.calls[0][0].content)).toEqual(['111', '222']);
            });

            it('lässt niemanden doppelt an die Platte', async () => {
                const interaction = mockButton('pingpong-rundlauf:beitreten:111', '222',
                    lobbyInhalt(['111', '222']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            });

            it('weist ab, wenn die Platte voll ist', async () => {
                const voll = Array.from({length: MAX_RUNDLAUF}, (_, i) => `${100 + i}`);
                const interaction = mockButton('pingpong-rundlauf:beitreten:111', '999', lobbyInhalt(voll));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply.mock.calls[0][0].content).toContain(`${MAX_RUNDLAUF}`);
            });

            it('nimmt eine Person wieder aus der Liste', async () => {
                const interaction = mockButton('pingpong-rundlauf:verlassen:111', '222',
                    lobbyInhalt(['111', '222', '333']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(parseTeilnehmer(interaction.update.mock.calls[0][0].content)).toEqual(['111', '333']);
            });

            // Ginge der Eröffner, bliebe eine Runde stehen, die niemand mehr starten kann.
            it('verweist den Eröffner beim Verlassen auf Abbrechen', async () => {
                const interaction = mockButton('pingpong-rundlauf:verlassen:111', '111',
                    lobbyInhalt(['111', '222']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply.mock.calls[0][0].content).toContain('Abbrechen');
            });

            it('lässt nur den Eröffner absagen', async () => {
                const fremd = mockButton('pingpong-rundlauf:abbrechen:111', '222', lobbyInhalt(['111', '222']));
                await pingPongHandler.handleRundlaufButton(fremd);
                expect(fremd.update).not.toHaveBeenCalled();

                const eroeffner = mockButton('pingpong-rundlauf:abbrechen:111', '111', lobbyInhalt(['111']));
                await pingPongHandler.handleRundlaufButton(eroeffner);
                expect(eroeffner.update).toHaveBeenCalledWith(expect.objectContaining({components: []}));
            });

            it('lässt nur den Eröffner starten', async () => {
                const interaction = mockButton('pingpong-rundlauf:starten:111', '222',
                    lobbyInhalt(['111', '222', '333']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            });

            it('startet nicht unter der Mindestbesetzung', async () => {
                const interaction = mockButton('pingpong-rundlauf:starten:111', '111',
                    lobbyInhalt(['111', '222']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply.mock.calls[0][0].content).toContain(`${MIN_RUNDLAUF}`);
            });

            it('trägt Platzierung und Punkte für alle Teilnehmer ein', async () => {
                scoresInRedis({
                    '111PING_PONG': '10',
                    '222PING_PONG': '10',
                    '333PING_PONG': '10',
                });
                const interaction = mockButton('pingpong-rundlauf:starten:111', '111',
                    lobbyInhalt(['111', '222', '333']));

                await pingPongHandler.handleRundlaufButton(interaction);

                const ergebnis = interaction.update.mock.calls[0][0];
                expect(ergebnis.components).toEqual([]);
                // Jeder Teilnehmer steht mit einem Platz in der Ergebnisliste.
                expect(ergebnis.content).toContain('1. <@');
                expect(ergebnis.content).toContain('3. <@');
                for (const id of ['111', '222', '333']) {
                    expect(ergebnis.content).toContain(`<@${id}>`);
                    expect(redisService.set).toHaveBeenCalledWith(`${id}PING_PONG`, expect.any(String));
                }
                // Drei Leute bekommen -2 / ±0 / +1 (siehe rundlaufPunkte), hier also auf je 10 Punkte.
                expect(ergebnis.content).toContain('11 Punkte');
                expect(ergebnis.content).toContain('10 Punkte');
                expect(ergebnis.content).toContain('8 Punkte');
            });

            // Wie bei den Duellen: niemand soll ins Minus gespielt werden können.
            it('klemmt den Abzug bei 0 Punkten ab', async () => {
                scoresInRedis({});
                const interaction = mockButton('pingpong-rundlauf:starten:111', '111',
                    lobbyInhalt(['111', '222', '333']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.update.mock.calls[0][0].content).not.toContain('-1 Punkte');
                expect(interaction.update.mock.calls[0][0].content).toContain('0 Punkte');
            });

            // Das Finale ist das einzige echte Match - die Serie hängt daran, nicht am Rausfliegen.
            it('schreibt die Siegesserie nur aus dem Finale fort', async () => {
                scoresInRedis({});
                const interaction = mockButton('pingpong-rundlauf:starten:111', '111',
                    lobbyInhalt(['111', '222', '333']));

                await pingPongHandler.handleRundlaufButton(interaction);

                // Genau ein Sieger zählt seine Siegesserie hoch, genau ein Finalverlierer seine
                // Pechsträhne - wer vorher rausfliegt, hat gegen niemanden verloren.
                const hochgezaehlt = vi.mocked(redisService.increment).mock.calls.map(([key]) => key);
                expect(hochgezaehlt.filter(key => key.startsWith('PING_PONG:SERIE:'))).toHaveLength(1);
                expect(hochgezaehlt.filter(key => key.startsWith('PING_PONG:PECHSTRAEHNE:'))).toHaveLength(1);
            });

            it('sollte Fehler abfangen', async () => {
                vi.mocked(redisService.get).mockRejectedValue(new Error('Redis kaputt'));
                const interaction = mockButton('pingpong-rundlauf:starten:111', '111',
                    lobbyInhalt(['111', '222', '333']));

                await pingPongHandler.handleRundlaufButton(interaction);

                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            });
        });
    });
    describe('Doppel', () => {
        const user = (id: string, bot = false) => ({id, bot});

        const mockCommand = (userId: string, optionen: Record<string, {id: string, bot: boolean} | null> = {}) => ({
            user: {id: userId},
            options: {getUser: vi.fn((name: string) => optionen[name] ?? null)},
            reply: vi.fn().mockResolvedValue(undefined),
        } as any);

        const mockButton = (customId: string, userId: string, inhalt: string) => ({
            customId,
            user: {id: userId},
            message: {id: 'msg-1', content: inhalt},
            update: vi.fn(),
            reply: vi.fn().mockResolvedValue(undefined),
            replied: false,
        } as any);

        const festerInhalt = (team1: string[], team2: string[], ausstehend: string[]) =>
            pingPongHandler.baueFestenDoppelText('111', {team1, team2, ausstehend});
        const offenerInhalt = (teilnehmer: string[]) =>
            pingPongHandler.baueOffenenDoppelText('111', teilnehmer);

        const scoresInRedis = (scores: Record<string, string>) => {
            vi.mocked(redisService.get).mockImplementation(async (key: string) => scores[key] ?? null as any);
            vi.mocked(redisService.set).mockImplementation(async (_key: string, value: string) => value as any);
        };

        describe('formatDoppelZeilen / parseDoppelLobby', () => {
            it('liest die Lobby zurück, die formatDoppelZeilen geschrieben hat', () => {
                const lobby = {team1: ['1', '2'], team2: ['3'], ausstehend: ['2', '3']};
                expect(parseDoppelLobby(formatDoppelZeilen(lobby))).toEqual(lobby);
            });

            // Der Eröffner und der Partner stehen auch im Text darüber - nur die Marker-Zeilen zählen.
            it('ignoriert Mentions außerhalb der Zustandszeilen', () => {
                expect(parseDoppelLobby(festerInhalt(['111', '222'], [], []))).toEqual({
                    team1: ['111', '222'], team2: [], ausstehend: [],
                });
            });

            it('zeigt die freien Gegner-Plätze an', () => {
                expect(formatDoppelZeilen({team1: ['1', '2'], team2: [], ausstehend: []})).toContain('noch 2 Plätze frei');
                expect(formatDoppelZeilen({team1: ['1', '2'], team2: ['3'], ausstehend: []})).toContain('noch 1 Platz frei');
            });
        });

        describe('loseTeams', () => {
            it('teilt vier Leute in zwei Zweierteams, jeden genau einmal', () => {
                const [team1, team2] = loseTeams(['a', 'b', 'c', 'd']);

                expect(team1).toHaveLength(2);
                expect(team2).toHaveLength(2);
                expect([...team1, ...team2].sort()).toEqual(['a', 'b', 'c', 'd']);
            });
        });

        describe('handleDoppel', () => {
            it('eröffnet ohne Partner eine offene Lobby mit dem Eröffner', async () => {
                const interaction = mockCommand('111');

                await pingPongHandler.handleDoppel(interaction);

                const antwort = interaction.reply.mock.calls[0][0];
                expect(parseTeilnehmer(antwort.content)).toEqual(['111']);
                expect(antwort.components[0].components[0].data.custom_id).toBe('pingpong-doppel:dabei:111:offen');
            });

            it('eröffnet mit Partner und Gegnern eine feste Lobby, in der alle noch zusagen müssen', async () => {
                const interaction = mockCommand('111', {partner: user('222'), gegner1: user('333'), gegner2: user('444')});

                await pingPongHandler.handleDoppel(interaction);

                const antwort = interaction.reply.mock.calls[0][0];
                expect(parseDoppelLobby(antwort.content)).toEqual({
                    team1: ['111', '222'], team2: ['333', '444'], ausstehend: ['222', '333', '444'],
                });
                expect(antwort.components[0].components[0].data.custom_id).toBe('pingpong-doppel:dabei:111:fest');
            });

            it('lehnt Gegner ohne Partner ab', async () => {
                const interaction = mockCommand('111', {gegner1: user('333')});

                await pingPongHandler.handleDoppel(interaction);

                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
                expect(redisService.setWithExpiry).not.toHaveBeenCalled();
            });

            it.each([
                ['sich selbst', {partner: user('111')}],
                ['einen Bot', {partner: user('222', true)}],
                ['eine Person doppelt', {partner: user('222'), gegner1: user('222')}],
            ])('lehnt %s als Mitspieler ab, ohne den Cooldown zu verbrauchen', async (_fall, optionen) => {
                const interaction = mockCommand('111', optionen);

                await pingPongHandler.handleDoppel(interaction);

                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
                expect(redisService.setWithExpiry).not.toHaveBeenCalled();
            });

            it('greift den Duell-Cooldown ab', async () => {
                vi.mocked(redisService.getTimeToLive).mockResolvedValue(12);
                const interaction = mockCommand('111');

                await pingPongHandler.handleDoppel(interaction);

                expect(interaction.reply.mock.calls[0][0].content).toContain('12s');
            });
        });

        describe('handleDoppelButton', () => {
            it('ignoriert Buttons mit fremdem Prefix', async () => {
                const interaction = mockButton('pingpong-rundlauf:beitreten:111', '222', '');

                await pingPongHandler.handleDoppelButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply).not.toHaveBeenCalled();
            });

            it('lässt nur den Eröffner absagen', async () => {
                const fremd = mockButton('pingpong-doppel:abbrechen:111:offen', '222', offenerInhalt(['111', '222']));
                await pingPongHandler.handleDoppelButton(fremd);
                expect(fremd.update).not.toHaveBeenCalled();

                const eroeffner = mockButton('pingpong-doppel:abbrechen:111:offen', '111', offenerInhalt(['111']));
                await pingPongHandler.handleDoppelButton(eroeffner);
                expect(eroeffner.update).toHaveBeenCalledWith(expect.objectContaining({components: []}));
            });

            it('verweist den Eröffner beim Verlassen auf Abbrechen', async () => {
                const interaction = mockButton('pingpong-doppel:raus:111:fest', '111',
                    festerInhalt(['111', '222'], [], ['222']));

                await pingPongHandler.handleDoppelButton(interaction);

                expect(interaction.update).not.toHaveBeenCalled();
                expect(interaction.reply.mock.calls[0][0].content).toContain('Abbrechen');
            });

            describe('offene Lobby', () => {
                it('stellt Beitretende an die Platte, solange noch keine vier da sind', async () => {
                    const interaction = mockButton('pingpong-doppel:dabei:111:offen', '222', offenerInhalt(['111']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(parseTeilnehmer(interaction.update.mock.calls[0][0].content)).toEqual(['111', '222']);
                });

                it('lässt niemanden doppelt beitreten', async () => {
                    const interaction = mockButton('pingpong-doppel:dabei:111:offen', '222', offenerInhalt(['111', '222']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(interaction.update).not.toHaveBeenCalled();
                });

                it('nimmt eine Person wieder raus', async () => {
                    const interaction = mockButton('pingpong-doppel:raus:111:offen', '222',
                        offenerInhalt(['111', '222', '333']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(parseTeilnehmer(interaction.update.mock.calls[0][0].content)).toEqual(['111', '333']);
                });

                it('lost beim vierten die Teams aus und spielt sofort', async () => {
                    scoresInRedis({});
                    const interaction = mockButton('pingpong-doppel:dabei:111:offen', '444',
                        offenerInhalt(['111', '222', '333']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    const ergebnis = interaction.update.mock.calls[0][0];
                    expect(ergebnis.components).toEqual([]);
                    expect(ergebnis.content).toContain('Das Los stellt die Teams');
                    for (const id of ['111', '222', '333', '444']) {
                        expect(redisService.set).toHaveBeenCalledWith(`${id}PING_PONG`, expect.any(String));
                    }
                });

                // Klicken der vierte und ein fünfter gleichzeitig, darf nur EIN Match laufen.
                it('spielt nicht, wenn ein gleichzeitiger Klick schon gestartet hat', async () => {
                    vi.mocked(redisService.setIfAbsent).mockResolvedValue(false);
                    const interaction = mockButton('pingpong-doppel:dabei:111:offen', '444',
                        offenerInhalt(['111', '222', '333']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(redisService.setIfAbsent).toHaveBeenCalledWith('PING_PONG:DOPPEL_START:msg-1', '1', expect.any(Number));
                    expect(interaction.update).not.toHaveBeenCalled();
                    expect(redisService.set).not.toHaveBeenCalled();
                    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
                });
            });

            describe('feste Teams', () => {
                it('nimmt die Zusage des Partners an, ohne schon zu spielen', async () => {
                    const interaction = mockButton('pingpong-doppel:dabei:111:fest', '222',
                        festerInhalt(['111', '222'], [], ['222']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(parseDoppelLobby(interaction.update.mock.calls[0][0].content)).toEqual({
                        team1: ['111', '222'], team2: [], ausstehend: [],
                    });
                });

                it('setzt Freiwillige auf freie Gegner-Plätze', async () => {
                    const interaction = mockButton('pingpong-doppel:dabei:111:fest', '333',
                        festerInhalt(['111', '222'], [], ['222']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(parseDoppelLobby(interaction.update.mock.calls[0][0].content).team2).toEqual(['333']);
                });

                it('weist ab, wenn beide Gegner-Plätze vergeben sind', async () => {
                    const interaction = mockButton('pingpong-doppel:dabei:111:fest', '555',
                        festerInhalt(['111', '222'], ['333', '444'], ['333']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(interaction.update).not.toHaveBeenCalled();
                    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
                });

                it('wartet, bis alle Eingeladenen zugesagt haben', async () => {
                    // Team 2 ist voll, aber der Partner hat noch nicht zugesagt.
                    const interaction = mockButton('pingpong-doppel:dabei:111:fest', '444',
                        festerInhalt(['111', '222'], ['333', '444'], ['222', '444']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(parseDoppelLobby(interaction.update.mock.calls[0][0].content).ausstehend).toEqual(['222']);
                    expect(redisService.setIfAbsent).not.toHaveBeenCalled();
                });

                it('spielt, sobald die letzte Zusage da ist - ohne Auslosung', async () => {
                    scoresInRedis({});
                    const interaction = mockButton('pingpong-doppel:dabei:111:fest', '222',
                        festerInhalt(['111', '222'], ['333', '444'], ['222']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    const ergebnis = interaction.update.mock.calls[0][0];
                    expect(ergebnis.components).toEqual([]);
                    expect(ergebnis.content).not.toContain('Das Los');
                    // Die festen Teams bleiben zusammen, egal wer gewinnt.
                    expect(ergebnis.content).toMatch(/<@111> & <@222>|<@222> & <@111>/);
                    expect(ergebnis.content).toMatch(/<@333> & <@444>|<@444> & <@333>/);
                });

                it('lässt das Doppel ausfallen, wenn der Partner abspringt', async () => {
                    const interaction = mockButton('pingpong-doppel:raus:111:fest', '222',
                        festerInhalt(['111', '222'], ['333'], []));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({components: []}));
                });

                it('gibt den Platz eines abspringenden Gegners wieder frei', async () => {
                    const interaction = mockButton('pingpong-doppel:raus:111:fest', '333',
                        festerInhalt(['111', '222'], ['333', '444'], ['333']));

                    await pingPongHandler.handleDoppelButton(interaction);

                    expect(parseDoppelLobby(interaction.update.mock.calls[0][0].content)).toEqual({
                        team1: ['111', '222'], team2: ['444'], ausstehend: [],
                    });
                });
            });

            it('sollte Fehler abfangen', async () => {
                vi.mocked(redisService.get).mockRejectedValue(new Error('Redis kaputt'));
                const interaction = mockButton('pingpong-doppel:dabei:111:offen', '444',
                    offenerInhalt(['111', '222', '333']));

                await pingPongHandler.handleDoppelButton(interaction);

                expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
            });
        });

        describe('spieleUndWerteDoppelAus', () => {
            it('gibt jeder Person im Siegerteam +1 und nimmt jeder im Verliererteam 1', async () => {
                scoresInRedis({'1PING_PONG': '5', '2PING_PONG': '5', '3PING_PONG': '5', '4PING_PONG': '5'});

                const {content} = await pingPongHandler.spieleUndWerteDoppelAus(['1', '2'], ['3', '4'], false);

                const neu = Object.fromEntries(vi.mocked(redisService.set).mock.calls
                    .filter(([key]) => key.endsWith('PING_PONG'))
                    .map(([key, wert]) => [key, wert]));
                const team1Gewinnt = content.startsWith('**<@1> & <@2> gewinnen');
                expect(neu).toEqual(team1Gewinnt
                    ? {'1PING_PONG': '6', '2PING_PONG': '6', '3PING_PONG': '4', '4PING_PONG': '4'}
                    : {'1PING_PONG': '4', '2PING_PONG': '4', '3PING_PONG': '6', '4PING_PONG': '6'});
            });

            it('klemmt den Abzug bei 0 Punkten ab', async () => {
                scoresInRedis({});

                const {content} = await pingPongHandler.spieleUndWerteDoppelAus(['1', '2'], ['3', '4'], false);

                expect(content).not.toContain('**-1**');
            });

            // User-Entscheidung: die Serie zählt im Doppel wie im Duell, pro Kopf.
            it('schreibt die Siegesserie aller vier fort', async () => {
                scoresInRedis({});

                await pingPongHandler.spieleUndWerteDoppelAus(['1', '2'], ['3', '4'], false);

                const hochgezaehlt = vi.mocked(redisService.increment).mock.calls.map(([key]) => key).sort();
                // Beide Sieger zählen ihre Serie hoch, beide Verlierer ihre Pechsträhne.
                expect([
                    ['PING_PONG:PECHSTRAEHNE:3', 'PING_PONG:PECHSTRAEHNE:4', 'PING_PONG:SERIE:1', 'PING_PONG:SERIE:2'],
                    ['PING_PONG:PECHSTRAEHNE:1', 'PING_PONG:PECHSTRAEHNE:2', 'PING_PONG:SERIE:3', 'PING_PONG:SERIE:4'],
                ]).toContainEqual(hochgezaehlt);
            });
        });
    });
});
