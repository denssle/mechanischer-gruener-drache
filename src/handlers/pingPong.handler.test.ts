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

    describe('generatePingPongKey', () => {
        it('kombiniert userId und Key korrekt', () => {
            expect(pingPongHandler.generatePingPongKey('123')).toBe('123PING_PONG');
        });

        it('funktioniert mit verschiedenen UserIds', () => {
            expect(pingPongHandler.generatePingPongKey('abc')).toBe('abcPING_PONG');
        });
    });
});