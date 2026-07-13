import {randomUUID} from 'crypto';
import redisService from './redis.service.js';
import {SportEntry, SportActivity, SportMilestone} from '../types/sport.js';

const KEYS = {
    entry: (id: string) => `SPORT:ENTRY:${id}`,
    userEntries: (userId: string) => `SPORT:USER:${userId}`,
    highscore: 'SPORT:HIGHSCORE',
    milestones: 'SPORT:MILESTONES',
    announcementChannel: 'SPORT:ANNOUNCEMENT_CHANNEL',
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

    // Korrigiert den zuletzt eingetragenen Eintrag des Users. Die Eintrags-Liste ist per rPush
    // gefüllt, der letzte Listeneintrag ist also der neueste. null = der User hat noch nichts eingetragen.
    async editLastEntry(userId: string, newKilometers: number): Promise<SportEntry | null> {
        const entryIds = await redisService.getList(KEYS.userEntries(userId));
        const lastId = entryIds?.at(-1);
        if (!lastId) return null;

        return this.editEntry(userId, lastId, newKilometers);
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

    // Legt einen Meilenstein an bzw. überschreibt einen bestehenden bei gleicher Kilometerzahl.
    // announced startet immer bei false, damit ein neu gesetzter Meilenstein feiern kann.
    async setMilestone(kilometers: number, text: string): Promise<void> {
        const milestone: SportMilestone = {kilometers, text, announced: false};
        await redisService.setHashField(KEYS.milestones, String(kilometers), JSON.stringify(milestone));
    }

    async getMilestones(): Promise<SportMilestone[]> {
        const all = await redisService.getHashAll(KEYS.milestones);
        return Object.values(all)
            .map(value => JSON.parse(value) as SportMilestone)
            .sort((a, b) => a.kilometers - b.kilometers);
    }

    async removeMilestone(kilometers: number): Promise<boolean> {
        const all = await redisService.getHashAll(KEYS.milestones);
        if (!(String(kilometers) in all)) return false;
        await redisService.deleteHashField(KEYS.milestones, String(kilometers));
        return true;
    }

    // Findet alle noch nicht angekündigten Meilensteine, deren Schwelle die Gesamtsumme
    // (getGesamtKilometer - alles zählt) erreicht hat, markiert sie als announced und gibt
    // sie zurück. Das eigentliche Posten übernimmt der Handler (braucht den Discord-Client).
    async checkAndMarkReachedMilestones(): Promise<SportMilestone[]> {
        const gesamt = await this.getGesamtKilometer();
        const milestones = await this.getMilestones();

        const newlyReached: SportMilestone[] = [];
        for (const milestone of milestones) {
            if (!milestone.announced && milestone.kilometers <= gesamt) {
                milestone.announced = true;
                await redisService.setHashField(KEYS.milestones, String(milestone.kilometers), JSON.stringify(milestone));
                newlyReached.push(milestone);
            }
        }
        return newlyReached;
    }

    async setAnnouncementChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.announcementChannel, channelId);
    }

    async getAnnouncementChannel(): Promise<string | null> {
        return redisService.get(KEYS.announcementChannel);
    }
}

export default new SportService();
