import {describe, it, expect, vi, beforeEach} from 'vitest';
import {MessageFlags} from 'discord.js';

vi.mock("../services/redis.service.js", () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        getSortedSet: vi.fn(),
        setSortedSet: vi.fn(),
        getTimeToLive: vi.fn(),
        setWithExpiry: vi.fn(),
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

import redisService from "../services/redis.service.js";
import userService from "../services/user.service.js";
import pingPongHandler, {DUELL_FLAVORS, randomDuellFlavor, spieleDuell} from "./pingPong.handler.js";

describe('PingPongHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Standard: kein aktiver Cooldown (Redis liefert -2 wenn der Key nicht existiert).
        vi.mocked(redisService.getTimeToLive).mockResolvedValue(-2);
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

    describe('handleHilfe', () => {
        it('nennt alle drei Ping-Pong-Befehle', async () => {
            const interaction = {reply: vi.fn()} as any;

            await pingPongHandler.handleHilfe(interaction);

            const text = interaction.reply.mock.calls[0][0];
            expect(text).toContain('/pingpong herausfordern');
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

    describe('handlePingPongHighscore', () => {
        const mockInteraction = () => ({ reply: vi.fn() } as any);

        it('meldet wenn es noch keine Highscores gibt', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([]);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('noch keine Highscores'));
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

            expect(interaction.reply).toHaveBeenCalledWith('1. Erster - 42\n2. Zweiter - 10');
        });

        it('fällt auf die rohe User-ID zurück wenn kein gespeicherter User existiert', async () => {
            vi.mocked(redisService.getSortedSet).mockResolvedValue([
                { value: 'user-1', score: 5 },
            ] as any);
            vi.mocked(userService.getUser).mockResolvedValue(null);
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith('1. user-1 - 5');
        });

        it('sollte Fehler abfangen', async () => {
            vi.mocked(redisService.getSortedSet).mockRejectedValue(new Error('Redis kaputt'));
            const interaction = mockInteraction();

            await pingPongHandler.handlePingPongHighscore(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
        });
    });
});