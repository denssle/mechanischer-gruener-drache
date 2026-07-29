import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
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

vi.mock("../services/pingPong.service.js", () => ({
    default: {
        getLastSeason: vi.fn(),
        setLastSeason: vi.fn(),
        getChampionRole: vi.fn(),
        addRuhmeshalleEintrag: vi.fn(async () => true),
        getRuhmeshalle: vi.fn(),
    }
}));

vi.mock("../../config.json", () => ({default: {GUILD_ID: 'guild-1'}}));
vi.mock("../client.js", () => ({default: {guilds: {cache: new Map()}}}));

import redisService from "../services/redis.service.js";
import userService from "../services/user.service.js";
import pingPongService from "../services/pingPong.service.js";
import client from "../client.js";
import pingPongHandler, {
    DUELL_FLAVORS,
    entscheideTaktik,
    formatAnsage,
    formatMonat,
    formatSerie,
    monatsSchluessel,
    randomDuellFlavor,
    spieleDuell,
    TAKTIK_AKTIONEN,
    waehleSieger
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
            expect(stand).toEqual({
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

        it('löscht nichts, wenn der Verlierer gar keine Serie hatte', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            await pingPongHandler.verarbeiteSerie('user-a', 'user-b');

            expect(redisService.delete).not.toHaveBeenCalled();
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

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('1. Erster - 42\n2. Zweiter - 10'));
        });

        it('fällt auf die rohe User-ID zurück wenn kein gespeicherter User existiert', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 5 },
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue(null);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('1. user-1 - 5'));
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

            expect(interaction.reply.mock.calls[0][0]).toContain('1. Erster - 3');
            expect(interaction.reply.mock.calls[0][0]).not.toContain('user-2');
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

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('1. Erster - 42 (4 in Folge)\n2. Zweiter - 10'));
        });
    });
    // --- Seasons ---------------------------------------------------------------------------
    describe('Season-Helfer', () => {
        it('monatsSchluessel baut YYYY-MM in lokaler Zeit', () => {
            expect(monatsSchluessel(new Date(2026, 6, 29, 23, 30))).toBe('2026-07');
            expect(monatsSchluessel(new Date(2026, 0, 1))).toBe('2026-01');
        });

        it('formatMonat macht daraus den deutschen Monatsnamen', () => {
            expect(formatMonat('2026-07')).toBe('Juli 2026');
            expect(formatMonat('2025-12')).toBe('Dezember 2025');
        });

        it('formatMonat lässt Unbekanntes stehen, statt zu scheitern', () => {
            expect(formatMonat('kaputt')).toBe('kaputt');
            expect(formatMonat('2026-13')).toBe('2026-13');
        });

        it('waehleSieger nimmt den höchsten Punktestand', () => {
            expect(waehleSieger([
                {value: 'a', score: 3},
                {value: 'b', score: 9},
                {value: 'c', score: 5},
            ])).toEqual({userId: 'b', punkte: 9});
        });

        it('waehleSieger lost bei Gleichstand unter den Punktgleichen', () => {
            const gleichstand = [
                {value: 'a', score: 7},
                {value: 'b', score: 7},
                // Der Punktärmere darf nie gewinnen, egal wie das Los fällt.
                {value: 'c', score: 2},
            ];
            const zufall = vi.spyOn(Math, 'random');

            zufall.mockReturnValue(0);
            expect(waehleSieger(gleichstand)!.userId).toBe('a');

            zufall.mockReturnValue(0.99);
            expect(waehleSieger(gleichstand)!.userId).toBe('b');

            zufall.mockRestore();
        });

        it('waehleSieger liefert null bei leerer Season (niemand mit Punkten)', () => {
            expect(waehleSieger([])).toBeNull();
            expect(waehleSieger([{value: 'a', score: 0}])).toBeNull();
        });
    });

    describe('rechneSeasonAb', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(2026, 6, 1, 0, 0));
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue(null);
            // clearAllMocks leert nur die Aufrufe, nicht die Implementierungen.
            vi.mocked(pingPongService.addRuhmeshalleEintrag).mockResolvedValue(true);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('setzt den Monatsmarker beim allerersten Lauf, ohne abzurechnen', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue(null);

            await pingPongHandler.rechneSeasonAb();

            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(pingPongService.addRuhmeshalleEintrag).not.toHaveBeenCalled();
            expect(redisService.getSortedSetAll).not.toHaveBeenCalled();
        });

        // Der Marker wurde früher nur einmal beim Boot gesetzt - schlug das fehl, lief die
        // Abrechnung nie wieder. Deshalb hängt die Initialisierung jetzt am Minuten-Timer.
        it('setzt den fehlenden Marker auch dann, wenn er beim Start nicht gesetzt werden konnte', async () => {
            vi.mocked(pingPongService.getLastSeason)
                .mockResolvedValueOnce(null)
                .mockResolvedValue('2026-07');

            await pingPongHandler.rechneSeasonAb();
            await pingPongHandler.rechneSeasonAb();

            expect(pingPongService.setLastSeason).toHaveBeenCalledTimes(1);
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        // Bricht die Abrechnung zwischen Eintrag und Reset ab, läuft sie eine Minute später erneut
        // und sähe nur noch die Reste im Sorted Set - der echte Champion darf nicht ersetzt werden.
        it('überschreibt einen bereits eingetragenen Champion nicht und vergibt die Rolle nicht erneut', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'rest', score: 1}] as any);
            vi.mocked(pingPongService.addRuhmeshalleEintrag).mockResolvedValue(false);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');

            await pingPongHandler.rechneSeasonAb();

            // Aufgeräumt und weitergeschaltet wird trotzdem, sonst bliebe die Season offen.
            expect(redisService.delete).toHaveBeenCalledWith('PING_PONG');
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(pingPongService.getChampionRole).not.toHaveBeenCalled();
        });

        it('tut nichts, solange der Monat nicht gewechselt hat', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-07');

            await pingPongHandler.rechneSeasonAb();

            expect(redisService.getSortedSetAll).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).not.toHaveBeenCalled();
        });

        it('trägt den Sieger des Vormonats ein, setzt die Scores zurück und schreibt den Marker', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([
                {value: 'user-1', score: 12},
                {value: 'user-2', score: 3},
            ] as any);

            await pingPongHandler.rechneSeasonAb();

            expect(pingPongService.addRuhmeshalleEintrag).toHaveBeenCalledWith('2026-06', 'user-1', 12);
            // Der Score liegt doppelt: Einzelkey je User UND Sorted Set - beides muss weg.
            expect(redisService.delete).toHaveBeenCalledWith('user-1PING_PONG');
            expect(redisService.delete).toHaveBeenCalledWith('user-2PING_PONG');
            expect(redisService.delete).toHaveBeenCalledWith('PING_PONG');
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        it('rührt Serie und Rekord beim Reset nicht an', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'user-1', score: 4}] as any);

            await pingPongHandler.rechneSeasonAb();

            const geloescht = vi.mocked(redisService.delete).mock.calls.map(([key]) => key);
            expect(geloescht).not.toContain('PING_PONG:SERIE:user-1');
            expect(geloescht).not.toContain('PING_PONG:REKORD:user-1');
        });

        it('holt einen verpassten Monatswechsel nach (Bot war aus)', async () => {
            vi.setSystemTime(new Date(2026, 6, 4, 9, 0));
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-05');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'user-1', score: 8}] as any);

            await pingPongHandler.rechneSeasonAb();

            expect(pingPongService.addRuhmeshalleEintrag).toHaveBeenCalledWith('2026-05', 'user-1', 8);
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        it('legt bei leerer Season keinen Eintrag an, schreibt aber den Marker fort', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([] as any);

            await pingPongHandler.rechneSeasonAb();

            expect(pingPongService.addRuhmeshalleEintrag).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        it('rechnet auch ohne konfigurierte Champion-Rolle ab (nur Log statt Abbruch)', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'user-1', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue(null);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongHandler.rechneSeasonAb();

            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
        });

        it('nimmt die Champion-Rolle dem bisherigen Träger ab und gibt sie dem neuen Sieger', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');

            const altTraeger = {id: 'alt', roles: {remove: vi.fn().mockResolvedValue(undefined)}};
            const neuerChamp = {id: 'neu', roles: {add: vi.fn().mockResolvedValue(undefined)}};
            const rolle = {id: 'rolle-1', members: new Map([['alt', altTraeger]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {
                        permissions: {has: () => true},
                        roles: {highest: {comparePositionTo: () => 1}},
                    },
                    fetch: vi.fn(async () => neuerChamp),
                },
            } as any);

            await pingPongHandler.rechneSeasonAb();

            expect(altTraeger.roles.remove).toHaveBeenCalledWith(rolle);
            expect(neuerChamp.roles.add).toHaveBeenCalledWith(rolle);
            client.guilds.cache.clear();
        });

        it('vergibt die Rolle nicht, wenn sie über der Bot-Rolle steht - rechnet aber ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');

            const fetch = vi.fn();
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', {id: 'rolle-1', members: new Map()}]])},
                members: {
                    me: {
                        permissions: {has: () => true},
                        roles: {highest: {comparePositionTo: () => -1}},
                    },
                    fetch,
                },
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongHandler.rechneSeasonAb();

            expect(fetch).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });
        it('vergibt die Rolle nicht, wenn sie gelöscht wurde - rechnet aber ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-weg');
            const fetch = vi.fn();
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map()},
                members: {me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}}, fetch},
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongHandler.rechneSeasonAb();

            expect(fetch).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        it('vergibt die Rolle nicht ohne das Recht "Rollen verwalten" - rechnet aber ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const fetch = vi.fn();
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', {id: 'rolle-1', members: new Map()}]])},
                members: {me: {permissions: {has: () => false}, roles: {highest: {comparePositionTo: () => 1}}}, fetch},
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongHandler.rechneSeasonAb();

            expect(fetch).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        // Der Ruhmeshallen-Eintrag steht dann trotzdem schon - nur die Rolle entfällt.
        it('kommt damit klar, dass der Champion den Server verlassen hat', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'weg', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const altTraeger = {id: 'alt', roles: {remove: vi.fn().mockResolvedValue(undefined)}};
            const rolle = {id: 'rolle-1', members: new Map([['alt', altTraeger]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}},
                    fetch: vi.fn().mockRejectedValue(new Error('Unknown Member')),
                },
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongHandler.rechneSeasonAb();

            // Der bisherige Träger ist die Rolle trotzdem los - der Titel ist abgelaufen.
            expect(altTraeger.roles.remove).toHaveBeenCalled();
            expect(pingPongService.addRuhmeshalleEintrag).toHaveBeenCalledWith('2026-06', 'weg', 5);
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        // Best-effort: scheitert das Abnehmen bei einer Person, darf der neue Champion trotzdem
        // seine Rolle bekommen.
        it('vergibt die Rolle auch dann, wenn das Abnehmen beim Vorgänger scheitert', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const altTraeger = {id: 'alt', roles: {remove: vi.fn().mockRejectedValue(new Error('Missing Permissions'))}};
            const neuerChamp = {id: 'neu', roles: {add: vi.fn().mockResolvedValue(undefined)}};
            const rolle = {id: 'rolle-1', members: new Map([['alt', altTraeger]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}},
                    fetch: vi.fn(async () => neuerChamp),
                },
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongHandler.rechneSeasonAb();

            expect(neuerChamp.roles.add).toHaveBeenCalledWith(rolle);
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        // Die Abrechnung selbst ist da schon durch - sie darf an der Rolle nicht nachträglich scheitern.
        it('fängt einen Fehler beim Vergeben der Rolle ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockRejectedValue(new Error('Redis kaputt'));
            const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(pingPongHandler.rechneSeasonAb()).resolves.toBeUndefined();

            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(fehler).toHaveBeenCalled();
            fehler.mockRestore();
        });

        it('nimmt dem Sieger die Rolle nicht ab, wenn er sie schon trägt', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'titelverteidiger', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const champ = {
                id: 'titelverteidiger',
                roles: {remove: vi.fn().mockResolvedValue(undefined), add: vi.fn().mockResolvedValue(undefined)},
            };
            const rolle = {id: 'rolle-1', members: new Map([['titelverteidiger', champ]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}},
                    fetch: vi.fn(async () => champ),
                },
            } as any);

            await pingPongHandler.rechneSeasonAb();

            expect(champ.roles.remove).not.toHaveBeenCalled();
            expect(champ.roles.add).toHaveBeenCalledWith(rolle);
            client.guilds.cache.clear();
        });
    });

    describe('handleRuhmeshalle', () => {
        const mockInteraction = () => ({reply: vi.fn()} as any);

        it('listet die Champions und pingt dabei niemanden an', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockResolvedValue([
                {monat: '2026-06', userId: 'user-1', punkte: 12},
                {monat: '2026-05', userId: 'user-2', punkte: 9},
            ]);
            const interaction = mockInteraction();

            await pingPongHandler.handleRuhmeshalle(interaction);

            const antwort = interaction.reply.mock.calls[0][0];
            expect(antwort.content).toContain('Juni 2026: <@user-1> mit **12** Punkten');
            expect(antwort.content).toContain('Mai 2026: <@user-2> mit **9** Punkten');
            // Pflicht: sonst pingt jede Abfrage sämtliche Ex-Champions.
            expect(antwort.allowedMentions).toEqual({parse: []});
        });

        it('meldet eine leere Ruhmeshalle, statt eine leere Liste zu posten', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockResolvedValue([]);
            const interaction = mockInteraction();

            await pingPongHandler.handleRuhmeshalle(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('noch leer');
        });

        // Ganze Monate weglassen statt Zeilen abschneiden - Discord lehnt >2000 Zeichen ab.
        it('lässt ältere Monate weg, statt am Zeichenlimit zu scheitern', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockResolvedValue(
                Array.from({length: 200}, (_, i) => ({
                    monat: `2026-${String((i % 12) + 1).padStart(2, '0')}`,
                    userId: `user-${i}`.padEnd(20, '0'),
                    punkte: 10,
                }))
            );
            const interaction = mockInteraction();

            await pingPongHandler.handleRuhmeshalle(interaction);

            const {content} = interaction.reply.mock.calls[0][0];
            expect(content.length).toBeLessThanOrEqual(2000);
            // Der jüngste Monat steht drin, der 200. nicht mehr.
            expect(content).toContain('user-0'.padEnd(20, '0'));
            expect(content).not.toContain('user-199');
        });

        it('fängt einen Redis-Fehler ab', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockRejectedValue(new Error('Redis kaputt'));
            const interaction = mockInteraction();

            await pingPongHandler.handleRuhmeshalle(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
        });
    });
});
