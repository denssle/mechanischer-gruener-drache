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

import redisService from "../services/redis.service.js";
import userService from "../services/user.service.js";
import pingPongHandler, {
    DUELL_FLAVORS,
    formatAnsage,
    formatSerie,
    istAnsageEingetroffen,
    randomDuellFlavor,
    spieleDuell
} from "./pingPong.handler.js";

describe('PingPongHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

    describe('istAnsageEingetroffen / formatAnsage', () => {
        it('trifft zu, wenn der angesagte Ausgang eintritt', () => {
            expect(istAnsageEingetroffen('sieg', true)).toBe(true);
            expect(istAnsageEingetroffen('niederlage', false)).toBe(true);
        });

        it('trifft nicht zu, wenn es anders ausgeht', () => {
            expect(istAnsageEingetroffen('sieg', false)).toBe(false);
            expect(istAnsageEingetroffen('niederlage', true)).toBe(false);
        });

        it('wertet ein Duell ohne Ansage nie als Treffer', () => {
            expect(istAnsageEingetroffen(undefined, true)).toBe(false);
            expect(formatAnsage(undefined, 'user-a', true)).toBeNull();
        });

        it('formuliert Treffer und Fehlschlag', () => {
            expect(formatAnsage('niederlage', 'user-a', false)).toContain('Ansage getroffen');
            expect(formatAnsage('niederlage', 'user-a', true)).toContain('Ansage daneben');
        });
    });

    describe('handleAnsageduell', () => {
        const mockInteraction = (gegner: any, ansage: string) => ({
            user: {id: 'user-a'},
            options: {
                getUser: vi.fn().mockReturnValue(gegner),
                getString: vi.fn().mockReturnValue(ansage),
            },
            reply: vi.fn(),
        } as any);

        it('postet die Herausforderung mit der Ansage in der customId', async () => {
            const interaction = mockInteraction({id: 'user-b', bot: false}, 'niederlage');

            await pingPongHandler.handleAnsageduell(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('die eigene Niederlage');

            const buttons = reply.components[0].toJSON().components;
            expect(buttons.map((b: any) => b.custom_id)).toEqual([
                'pingpong-ansage:annehmen:user-a:user-b:niederlage',
                'pingpong-ansage:ablehnen:user-a:user-b:niederlage',
            ]);
            expect(redisService.setWithExpiry).toHaveBeenCalledWith('PING_PONG:COOLDOWN:user-a', '1', 30);
        });

        it('teilt sich den Cooldown mit dem normalen Duell', async () => {
            vi.mocked(redisService.getTimeToLive).mockResolvedValue(12);
            const interaction = mockInteraction({id: 'user-b', bot: false}, 'sieg');

            await pingPongHandler.handleAnsageduell(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('12s'),
                flags: MessageFlags.Ephemeral,
            }));
        });

        it('lehnt Bots und sich selbst ab', async () => {
            await pingPongHandler.handleAnsageduell(mockInteraction({id: 'user-a', bot: false}, 'sieg'));
            await pingPongHandler.handleAnsageduell(mockInteraction({id: 'bot-1', bot: true}, 'sieg'));

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

        it('gibt dem Herausforderer einen Extra-Punkt, wenn er seinen Sieg angesagt hatte', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4); // Herausforderer gewinnt
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-ansage:annehmen:user-a:user-b:sieg', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            // 10 + 1 (Sieg) + 1 (getroffene Ansage)
            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '12');
            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '3');
            expect(interaction.update.mock.calls[0][0].content).toContain('Ansage getroffen');
        });

        it('gibt den Extra-Punkt auch für eine angesagte eigene Niederlage', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9); // Gegner gewinnt
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-ansage:annehmen:user-a:user-b:niederlage', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            // 10 - 1 (Niederlage) + 1 (getroffene Ansage) = 10, der Gegner bekommt seinen Siegpunkt
            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '10');
            expect(redisService.set).toHaveBeenCalledWith('user-bPING_PONG', '5');
        });

        it('kostet eine falsche Ansage nichts zusätzlich', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9); // Gegner gewinnt, angesagt war der eigene Sieg
            scoresInRedis({'user-aPING_PONG': '10', 'user-bPING_PONG': '4'});
            const interaction = mockButton('pingpong-ansage:annehmen:user-a:user-b:sieg', 'user-b');

            await pingPongHandler.handleDuellButton(interaction);

            expect(redisService.set).toHaveBeenCalledWith('user-aPING_PONG', '9');
            expect(interaction.update.mock.calls[0][0].content).toContain('Ansage daneben');
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

            expect(interaction.reply).toHaveBeenCalledWith('1. Erster - 42 (4 in Folge)\n2. Zweiter - 10');
        });
    });
});