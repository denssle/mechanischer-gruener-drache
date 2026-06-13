import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        addToList: vi.fn(),
        removeFromList: vi.fn(),
        getList: vi.fn(),
        incrementSortedSet: vi.fn(),
        getSortedSet: vi.fn(),
    }
}));

import redisService from '../services/redis.service.js';
import sportService from './sport.service.js';
import { SportEntry } from '../types/sport.js';

const mockEntry = (overrides: Partial<SportEntry> = {}): SportEntry => ({
    id: 'test-id-123',
    userId: 'user-123',
    activity: 'laufen',
    kilometers: 10,
    createdAt: new Date().toISOString(),
    ...overrides,
});

describe('SportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('editEntry', () => {
        it('berechnet die Differenz beim Bearbeiten korrekt', async () => {
            const entry = mockEntry({ kilometers: 10 });
            vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(entry));

            await sportService.editEntry('user-123', 'test-id-123', 15);

            expect(redisService.incrementSortedSet).toHaveBeenCalledWith(
                'SPORT:HIGHSCORE',
                'user-123',
                5  // diff: 15 - 10 = 5
            );
        });

        it('gibt null zurück wenn der Eintrag nicht existiert', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            const result = await sportService.editEntry('user-123', 'nicht-vorhanden', 15);

            expect(result).toBeNull();
            expect(redisService.incrementSortedSet).not.toHaveBeenCalled();
        });

        it('gibt null zurück wenn der Eintrag einem anderen User gehört', async () => {
            const entry = mockEntry({ userId: 'anderer-user' });
            vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(entry));

            const result = await sportService.editEntry('user-123', 'test-id-123', 15);

            expect(result).toBeNull();
            expect(redisService.incrementSortedSet).not.toHaveBeenCalled();
        });
    });

    describe('getUserEntries', () => {
        it('filtert null-Einträge heraus wenn ein Entry in Redis fehlt', async () => {
            const entry = mockEntry();
            vi.mocked(redisService.getList).mockResolvedValue(['test-id-123', 'fehlt-in-redis']);
            vi.mocked(redisService.get)
                .mockResolvedValueOnce(JSON.stringify(entry))
                .mockResolvedValueOnce(null);

            const result = await sportService.getUserEntries('user-123');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('test-id-123');
        });

        it('gibt leeres Array zurück wenn der User keine Einträge hat', async () => {
            vi.mocked(redisService.getList).mockResolvedValue([]);

            const result = await sportService.getUserEntries('user-123');

            expect(result).toEqual([]);
        });
    });
});
