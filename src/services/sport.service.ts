import { randomUUID } from 'crypto';
import redisService from './redis.service.js';
import { SportEntry, SportActivity } from '../types/sport.js';

const KEYS = {
    entry: (id: string) => `SPORT:ENTRY:${id}`,
    userEntries: (userId: string) => `SPORT:USER:${userId}`,
    highscore: 'SPORT:HIGHSCORE',
};

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

    async getHighscore(): Promise<{ userId: string; kilometers: number }[]> {
        const results = await redisService.getSortedSet(KEYS.highscore);
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(item => ({ userId: item.value, kilometers: item.score }));
    }
}

export default new SportService();
