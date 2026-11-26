import { describe, it, expect, vi } from 'vitest';

// Der Service ruft createClient schon beim Import auf. Den Mock-Client deshalb per
// vi.hoisted anlegen, damit Factory und Tests dasselbe Objekt sehen.
const mockClient = vi.hoisted(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('value'),
    zAdd: vi.fn().mockResolvedValue(1),
    zRangeWithScores: vi.fn().mockResolvedValue([]),
    zRangeByScore: vi.fn().mockResolvedValue([]),
    zCount: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(1),
    rPush: vi.fn().mockResolvedValue(1),
    lRem: vi.fn().mockResolvedValue(1),
    lRange: vi.fn().mockResolvedValue([]),
    zIncrBy: vi.fn().mockResolvedValue('1'),
    hExists: vi.fn().mockResolvedValue(1),
    isOpen: false
}));

vi.mock('redis', () => ({
    createClient: vi.fn(() => mockClient)
}));

import redisService from './redis.service.js';

// Seit Vitest 5 ist clearMocks standardmäßig an: vor jedem Test wird der Aufrufverlauf
// geleert, also auch das, was beim Import passiert ist. Deshalb hier einmal festhalten.
const onAufrufeBeimImport = [...mockClient.on.mock.calls];

describe('RedisService', () => {

    it('registriert einen error-Listener, damit ein Verbindungsfehler nicht den Prozess crasht', () => {
        expect(onAufrufeBeimImport).toContainEqual(['error', expect.any(Function)]);
    });

    it('sollte sich verbinden, wenn nicht offen', async () => {
        mockClient.isOpen = false;
        await redisService.connect();
        expect(mockClient.connect).toHaveBeenCalled();
    });

    it('sollte set korrekt aufrufen', async () => {
        const result = await redisService.set('key', 'value');
        expect(mockClient.set).toHaveBeenCalledWith('key', 'value');
        expect(result).toBe('value');
    });

    it('sollte get korrekt aufrufen', async () => {
        mockClient.get.mockResolvedValue('found');
        const result = await redisService.get('key');
        expect(mockClient.get).toHaveBeenCalledWith('key');
        expect(result).toBe('found');
    });

    it('sollte setSortedSet korrekt aufrufen', async () => {
        await redisService.setSortedSet('key', 'val', 10);
        expect(mockClient.zAdd).toHaveBeenCalledWith('key', { value: 'val', score: 10 });
    });

    it('sollte countSortedSetByScore an zCount weiterreichen', async () => {
        await redisService.countSortedSetByScore('key', 100, 200);

        expect(mockClient.zCount).toHaveBeenCalledWith('key', 100, 200);
    });

    it('sollte getSortedSetByScore korrekt aufrufen', async () => {

        await redisService.getSortedSetByScore('key', 100, 200);

        expect(mockClient.zRangeByScore).toHaveBeenCalledWith('key', 100, 200);
    });

    it('sollte incrementSortedSet korrekt aufrufen', async () => {
        await redisService.incrementSortedSet('key', 'val', 5);
        expect(mockClient.zIncrBy).toHaveBeenCalledWith('key', 5, 'val');
    });

    it('setIfAbsent setzt nur einen fehlenden Key und meldet, ob es geklappt hat', async () => {
        mockClient.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

        expect(await redisService.setIfAbsent('lock', '1', 60)).toBe(true);
        expect(await redisService.setIfAbsent('lock', '1', 60)).toBe(false);
        expect(mockClient.set).toHaveBeenCalledWith('lock', '1', {NX: true, EX: 60});
    });

    it('hashFieldExists castet das 0/1 von HEXISTS auf einen echten Boolean', async () => {
        mockClient.hExists.mockResolvedValue(1);
        expect(await redisService.hashFieldExists('key', 'feld')).toBe(true);
        expect(mockClient.hExists).toHaveBeenCalledWith('key', 'feld');
        mockClient.hExists.mockResolvedValue(0);
        expect(await redisService.hashFieldExists('key', 'feld')).toBe(false);
    });
});
