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
        removeFromSortedSet: vi.fn(),
        getSortedSet: vi.fn(),
        getSortedSetAll: vi.fn(),
        setSortedSet: vi.fn(),
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

    describe('addEntry', () => {
        it('speichert den Eintrag, verknüpft ihn mit dem User und erhöht die Bestenliste', async () => {
            const entry = await sportService.addEntry('user-123', 'laufen', 10);

            expect(entry.userId).toBe('user-123');
            expect(entry.activity).toBe('laufen');
            expect(entry.kilometers).toBe(10);
            expect(redisService.set).toHaveBeenCalledWith(`SPORT:ENTRY:${entry.id}`, JSON.stringify(entry));
            expect(redisService.addToList).toHaveBeenCalledWith('SPORT:USER:user-123', entry.id);
            expect(redisService.incrementSortedSet).toHaveBeenCalledWith('SPORT:HIGHSCORE', 'user-123', 10);
        });
    });

    describe('deleteEntry', () => {
        it('gibt false zurück wenn der Eintrag nicht existiert', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            const result = await sportService.deleteEntry('user-123', 'nicht-vorhanden');

            expect(result).toBe(false);
            expect(redisService.incrementSortedSet).not.toHaveBeenCalled();
        });

        it('gibt false zurück wenn der Eintrag einem anderen User gehört', async () => {
            const entry = mockEntry({ userId: 'anderer-user' });
            vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(entry));

            const result = await sportService.deleteEntry('user-123', 'test-id-123');

            expect(result).toBe(false);
            expect(redisService.delete).not.toHaveBeenCalled();
        });

        it('löscht den Eintrag und zieht die Kilometer von der Bestenliste ab', async () => {
            const entry = mockEntry({ kilometers: 10 });
            vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(entry));

            const result = await sportService.deleteEntry('user-123', 'test-id-123');

            expect(result).toBe(true);
            expect(redisService.delete).toHaveBeenCalledWith('SPORT:ENTRY:test-id-123');
            expect(redisService.removeFromList).toHaveBeenCalledWith('SPORT:USER:user-123', 'test-id-123');
            expect(redisService.incrementSortedSet).toHaveBeenCalledWith('SPORT:HIGHSCORE', 'user-123', -10);
        });
    });

    describe('setKilometer', () => {
        it('setzt den Kilometerstand eines Users direkt', async () => {
            await sportService.setKilometer('user-123', 42);

            expect(redisService.setSortedSet).toHaveBeenCalledWith('SPORT:HIGHSCORE', 'user-123', 42);
        });
    });

    describe('addLegacyKilometer', () => {
        it('erhöht die Bestenliste für den Legacy-Dummy-User', async () => {
            await sportService.addLegacyKilometer(100);

            expect(redisService.incrementSortedSet).toHaveBeenCalledWith('SPORT:HIGHSCORE', 'LEGACY_KILOMETERS', 100);
        });
    });

    describe('getLegacyKilometer', () => {
        it('liest den aktuellen Bestandskilometer-Wert aus der Bestenliste', async () => {
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([
                { value: 'user-1', score: 30 },
                { value: 'LEGACY_KILOMETERS', score: 250 },
            ] as any);

            const wert = await sportService.getLegacyKilometer();

            expect(wert).toBe(250);
        });

        it('gibt 0 zurück wenn kein Legacy-Eintrag existiert', async () => {
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{ value: 'user-1', score: 30 }] as any);

            expect(await sportService.getLegacyKilometer()).toBe(0);
        });
    });

    describe('setLegacyKilometer', () => {
        it('setzt den Bestandskilometer-Wert direkt', async () => {
            await sportService.setLegacyKilometer(500);

            expect(redisService.setSortedSet).toHaveBeenCalledWith('SPORT:HIGHSCORE', 'LEGACY_KILOMETERS', 500);
            expect(redisService.removeFromSortedSet).not.toHaveBeenCalled();
        });

        it('entfernt den Legacy-Eintrag ganz wenn auf 0 gesetzt wird', async () => {
            await sportService.setLegacyKilometer(0);

            expect(redisService.removeFromSortedSet).toHaveBeenCalledWith('SPORT:HIGHSCORE', 'LEGACY_KILOMETERS');
            expect(redisService.setSortedSet).not.toHaveBeenCalled();
        });
    });

    describe('getGesamtKilometer', () => {
        it('summiert alle Einträge, nicht nur die Top 10', async () => {
            // 11 Einträge - mehr als das Top-10-Limit von getSortedSet, um sicherzustellen,
            // dass getGesamtKilometer wirklich getSortedSetAll (ungekürzt) nutzt.
            const elfEintraege = Array.from({ length: 11 }, (_, i) => ({ value: `user-${i}`, score: 10 }));
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue(elfEintraege as any);

            const gesamt = await sportService.getGesamtKilometer();

            expect(redisService.getSortedSetAll).toHaveBeenCalledWith('SPORT:HIGHSCORE');
            expect(redisService.getSortedSet).not.toHaveBeenCalled();
            expect(gesamt).toBe(110);
        });

        it('gibt 0 zurück wenn noch niemand etwas eingetragen hat', async () => {
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([]);

            const gesamt = await sportService.getGesamtKilometer();

            expect(gesamt).toBe(0);
        });
    });
});
