import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock("../services/redis.service.js", () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        getSortedSet: vi.fn(),
        setSortedSet: vi.fn(),
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
import pingPongHandler from "./pingPong.handler.js";

describe('PingPongHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handlePingPong', () => {
        it('sollte einen Punkt geben, wenn Math.random < 0.5', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.4);
            vi.mocked(redisService.get).mockResolvedValue('10');
            vi.mocked(redisService.set).mockResolvedValue('11');

            const mockInteraction = {
                user: { id: 'user-123' },
                reply: vi.fn(),
            } as any;

            await pingPongHandler.handlePingPong(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('einen Punkt gemacht'));
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('11 Punkte'));
            expect(redisService.get).toHaveBeenCalledWith('user-123PING_PONG');
            expect(redisService.set).toHaveBeenCalledWith('user-123PING_PONG', '11');
            expect(redisService.setSortedSet).toHaveBeenCalledWith('PING_PONG', 'user-123', 11);
        });

        it('sollte keinen Punkt geben, wenn Math.random >= 0.5', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.6);
            vi.mocked(redisService.get).mockResolvedValue('10');

            const mockInteraction = {
                user: { id: 'user-123' },
                reply: vi.fn(),
            } as any;

            await pingPongHandler.handlePingPong(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('leider nichts'));
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('10 Punkten'));
        });

        it('sollte Fehler abfangen', async () => {
            vi.mocked(redisService.get).mockRejectedValue(new Error('Redis kaputt'));
            
            const mockInteraction = {
                user: { id: 'user-123' },
                reply: vi.fn(),
            } as any;

            await pingPongHandler.handlePingPong(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
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

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
        });
    });
});