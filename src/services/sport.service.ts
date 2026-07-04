import {randomUUID} from 'crypto';
import redisService from './redis.service.js';
import {SportEntry, SportActivity} from '../types/sport.js';

const KEYS = {
    entry: (id: string) => `SPORT:ENTRY:${id}`,
    userEntries: (userId: string) => `SPORT:USER:${userId}`,
    highscore: 'SPORT:HIGHSCORE',
};

const DUMMY_USER_ID = 'LEGACY_KILOMETERS';

class SportService {
    async addEntry(userId: string, activity: SportActivity, kilometers: number): Promise<SportEntry> {
        const entry: SportEntry = {
            id: randomUUID(),
            userId,
            activity,
            kilometers,
            createdAt: new Date().toISOString(),
        };

        await redisService.set(KEYS.entry(entry.id), JSON.stringify(entry));
        await redisService.addToList(KEYS.userEntries(userId), entry.id);
        await redisService.incrementSortedSet(KEYS.highscore, userId, kilometers);

        return entry;
    }

    async deleteEntry(userId: string, entryId: string): Promise<boolean> {
        const entryString = await redisService.get(KEYS.entry(entryId));
        if (!entryString) return false;

        const entry: SportEntry = JSON.parse(entryString);
        if (entry.userId !== userId) return false;

        await redisService.delete(KEYS.entry(entryId));
        await redisService.removeFromList(KEYS.userEntries(userId), entryId);
        await redisService.incrementSortedSet(KEYS.highscore, userId, -entry.kilometers);

        return true;
    }

    async editEntry(userId: string, entryId: string, newKilometers: number): Promise<SportEntry | null> {
        const entryString = await redisService.get(KEYS.entry(entryId));
        if (!entryString) return null;

        const entry: SportEntry = JSON.parse(entryString);
        if (entry.userId !== userId) return null;

        const diff = newKilometers - entry.kilometers;
        entry.kilometers = newKilometers;

        await redisService.set(KEYS.entry(entryId), JSON.stringify(entry));
        await redisService.incrementSortedSet(KEYS.highscore, userId, diff);

        return entry;
    }

    async getUserEntries(userId: string): Promise<SportEntry[]> {
        const entryIds = await redisService.getList(KEYS.userEntries(userId));
        if (!entryIds?.length) return [];

        const entries = await Promise.all(
            entryIds.map(async (id) => {
                const entryString = await redisService.get(KEYS.entry(id));
                return entryString ? JSON.parse(entryString) as SportEntry : null;
            })
        );

        return entries.filter((e): e is SportEntry => e !== null);
    }

    async setKilometer(userId: string, kilometers: number): Promise<void> {
        await redisService.setSortedSet(KEYS.highscore, userId, kilometers);
    }

    async getGesamtKilometer(): Promise<number> {
        const alle = await redisService.getSortedSetAll(KEYS.highscore);
        return alle.reduce((sum, item) => sum + item.score, 0);
    }

    async addLegacyKilometer(kilometers: number): Promise<void> {
        await redisService.incrementSortedSet(KEYS.highscore, DUMMY_USER_ID, kilometers);
    }

    async getLegacyKilometer(): Promise<number> {
        const alle = await redisService.getSortedSetAll(KEYS.highscore);
        return alle.find(item => item.value === DUMMY_USER_ID)?.score ?? 0;
    }

    // Setzt die Bestandskilometer direkt (statt zu addieren). 0 (oder weniger) entfernt
    // den Legacy-Eintrag ganz aus der Bestenliste, statt einen 0-Eintrag zu hinterlassen.
    async setLegacyKilometer(kilometers: number): Promise<void> {
        if (kilometers <= 0) {
            await redisService.removeFromSortedSet(KEYS.highscore, DUMMY_USER_ID);
        } else {
            await redisService.setSortedSet(KEYS.highscore, DUMMY_USER_ID, kilometers);
        }
    }
}

export default new SportService();
