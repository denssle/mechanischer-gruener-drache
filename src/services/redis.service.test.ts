import { describe, it, expect, vi } from 'vitest';

// Wir müssen redis mocken, bevor wir den Service importieren, 
// da der Service beim Import createClient aufruft.
vi.mock('redis', () => {
    const mockClient = {
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue('value'),
        zAdd: vi.fn().mockResolvedValue(1),
        zRangeWithScores: vi.fn().mockResolvedValue([]),
        del: vi.fn().mockResolvedValue(1),
        rPush: vi.fn().mockResolvedValue(1),
        lRem: vi.fn().mockResolvedValue(1),
        lRange: vi.fn().mockResolvedValue([]),
        zIncrBy: vi.fn().mockResolvedValue('1'),
        isOpen: false
    };
    return {
        createClient: vi.fn(() => mockClient)
    };
});

import { createClient } from 'redis';
import redisService from './redis.service.js';

describe('RedisService', () => {

    it('registriert einen error-Listener, damit ein Verbindungsfehler nicht den Prozess crasht', () => {
        const mockClient = vi.mocked(createClient).mock.results[0].value;
        expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('sollte sich verbinden, wenn nicht offen', async () => {
        const mockClient = vi.mocked(createClient).mock.results[0].value;
        mockClient.isOpen = false;
        await redisService.connect();
        expect(mockClient.connect).toHaveBeenCalled();
    });

    it('sollte set korrekt aufrufen', async () => {
        const mockClient = vi.mocked(createClient).mock.results[0].value;
        const result = await redisService.set('key', 'value');
        expect(mockClient.set).toHaveBeenCalledWith('key', 'value');
        expect(result).toBe('value');
    });

    it('sollte get korrekt aufrufen', async () => {
        const mockClient = vi.mocked(createClient).mock.results[0].value;
        mockClient.get.mockResolvedValue('found');
        const result = await redisService.get('key');
        expect(mockClient.get).toHaveBeenCalledWith('key');
        expect(result).toBe('found');
    });

    it('sollte setSortedSet korrekt aufrufen', async () => {
        const mockClient = vi.mocked(createClient).mock.results[0].value;
        await redisService.setSortedSet('key', 'val', 10);
        expect(mockClient.zAdd).toHaveBeenCalledWith('key', { value: 'val', score: 10 });
    });

    it('sollte incrementSortedSet korrekt aufrufen', async () => {
        const mockClient = vi.mocked(createClient).mock.results[0].value;
        await redisService.incrementSortedSet('key', 'val', 5);
        expect(mockClient.zIncrBy).toHaveBeenCalledWith('key', 5, 'val');
    });
});
