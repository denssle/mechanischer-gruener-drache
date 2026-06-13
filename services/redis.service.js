import {createClient} from "redis";
import path from 'node:path';
import os from 'node:os';

class RedisService {
    #client = createClient({
        socket: {
            path: path.join(os.homedir(), '.redis', 'sock')
        }
    });

    constructor() {
        this.#client.on("error", (err) => {
            console.error("Redis Client Error", err);
        });

        this.#client.connect().then(() => console.log("Redis connected"))
    }

    async set(key, value) {
        await this.#client.set(key, value);
        return value;
    }

    async get(key) {
        return await this.#client.get(key);
    }

    setSortedSet(key, value, score) {
        this.#client.zAdd(key, {value: value, score: score});
    }

    getSortedSet(key) {
        return this.#client.zRangeWithScores(key, 0, 9, {
            REV: true
        });
    }
}

export default new RedisService();