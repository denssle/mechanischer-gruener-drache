import {createClient} from "redis";
import path from 'node:path';
import os from 'node:os';

export const REDIS_KEYS = {
    PING_PONG: "PING_PONG",
} as const;

class RedisService {
    #client = createClient({
        socket: {
            path: path.join(os.homedir(), '.redis', 'sock'),
            tls: false
        }
    });

    constructor() {
        // Ohne Error-Listener crasht ein unhandled 'error'-Event (z.B. bei einem
        // fehlgeschlagenen automatischen Reconnect) den kompletten Bot-Prozess.
        this.#client.on('error', (error) => {
            console.error('❌ Redis-Verbindungsfehler:', error);
        });
    }

    async connect(): Promise<void> {
        if (!this.#client.isOpen) {
            await this.#client.connect();
            console.log("Redis connected");
        }
    }

    async set(key: string, value: string): Promise<string> {
        await this.#client.set(key, value);
        return value;
    }

    async get(key: string): Promise<string | null> {
        return await this.#client.get(key);
    }

    async setSortedSet(key: string, value: string, score: number): Promise<void> {
        await this.#client.zAdd(key, {value, score});
    }

    getSortedSet(key: string) {
        return this.#client.zRangeWithScores(key, 0, 9, {
            REV: true
        });
    }

    // Ungekürzt, für Summen über alle Mitglieder statt nur die Top 10 (z.B. Gesamtkilometer).
    getSortedSetAll(key: string) {
        return this.#client.zRangeWithScores(key, 0, -1);
    }

    async delete(key: string): Promise<void> {
        await this.#client.del(key);
    }

    async addToList(key: string, value: string): Promise<void> {
        await this.#client.rPush(key, value);
    }

    async removeFromList(key: string, value: string): Promise<void> {
        await this.#client.lRem(key, 0, value);
    }

    async getList(key: string): Promise<string[]> {
        return this.#client.lRange(key, 0, -1);
    }

    async incrementSortedSet(key: string, value: string, increment: number): Promise<void> {
        await this.#client.zIncrBy(key, increment, value);
    }

    async removeFromSortedSet(key: string, value: string): Promise<void> {
        await this.#client.zRem(key, value);
    }
}

export default new RedisService();