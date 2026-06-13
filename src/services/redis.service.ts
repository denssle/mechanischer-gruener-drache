import {createClient} from "redis";
import path from 'node:path';
import os from 'node:os';

class RedisService {
    #client = createClient({
        socket: {
            path: path.join(os.homedir(), '.redis', 'sock'),
            tls: false
        }
    });

    constructor() {
        this.#client.on("error", (err) => {
            console.error("Redis Client Error", err);
        });

        this.#client.connect().then(() => console.log("Redis connected"))
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
}

export default new RedisService();