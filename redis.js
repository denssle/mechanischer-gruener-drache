import {createClient} from "redis";
import path from 'node:path';
import os from 'node:os';

const client = createClient({
    socket: {
        path: path.join(os.homedir(), '.redis', 'sock')
    }
});

client.on("error", (err) => {
    console.error("Redis Client Error", err);
});

client.on('error', (err) => {
    console.error('Redis error:', err);
});

export async function startRedis() {
    await client.connect();
    console.log("Redis connected");
}

export async function set(key, value) {
    await client.set(key, value);
    return value;
}

export function get(key) {
    return client.get(key);
}

export function setSortedSet(key, scoreKey, scoreValue) {
    client.zAdd(key, {score: scoreValue, value: scoreKey});
}

export function getSortedSet(key) {
    return client.zRangeWithScores(key, 0, -1);
}