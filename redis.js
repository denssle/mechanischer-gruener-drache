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

export function set(key, value) {
    return client.set(key, value);
}

export function get(key) {
    return client.get(key);
}