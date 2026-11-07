import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import redisService from './redis.service.js';

// Läuft gegen ein ECHTES Redis, alle anderen Tests mocken es. Geprüft wird, was ein Mock nie zeigen
// kann: was die node-redis-Aufrufe wirklich zurückgeben (Sortierung, 0/1 statt Boolean, Infinity als
// Grenze). Nur mit REDIS_INTEGRATION=1, siehe npm run test:redis. Alle Keys tragen den Prefix QS_TEST:
// und werden am Ende gelöscht.
const PREFIX = 'QS_TEST:';
const benutzteKeys: string[] = [];
const key = (name: string): string => {
    const voll = `${PREFIX}${name}`;
    benutzteKeys.push(voll);
    return voll;
};

describe.skipIf(!process.env.REDIS_INTEGRATION)('redisService gegen echtes Redis', () => {
    beforeAll(async () => {
        await redisService.connect();
    });

    afterAll(async () => {
        for (const name of benutzteKeys) {
            await redisService.delete(name);
        }
    });

    it('liest zurück, was geschrieben wurde, und liefert für Fehlendes null', async () => {
        const k = key('text');

        expect(await redisService.set(k, 'wert')).toBe('wert');
        expect(await redisService.get(k)).toBe('wert');
        await redisService.delete(k);
        expect(await redisService.get(k)).toBeNull();
    });

    it('setWithExpiry vergibt eine Laufzeit, getTimeToLive meldet sie', async () => {
        const k = key('ablauf');

        expect(await redisService.getTimeToLive(k)).toBe(-2);
        await redisService.setWithExpiry(k, '1', 60);

        const rest = await redisService.getTimeToLive(k);
        expect(rest).toBeGreaterThan(0);
        expect(rest).toBeLessThanOrEqual(60);
    });

    // Daran hängt jeder Doppelklick-Schutz.
    it('setIfAbsent gewinnt nur beim ersten Mal', async () => {
        const k = key('lock');

        expect(await redisService.setIfAbsent(k, '1', 60)).toBe(true);
        expect(await redisService.setIfAbsent(k, '1', 60)).toBe(false);
    });

    // Die falsche Annahme hier hat /pingpong rundlaeufe die neuesten Runden gekostet.
    it('getSortedSetAll liefert aufsteigend, getSortedSet die Top 10 absteigend', async () => {
        const k = key('rangliste');
        for (let i = 1; i <= 12; i++) {
            await redisService.setSortedSet(k, `m${i}`, i);
        }

        const alle = await redisService.getSortedSetAll(k);
        const top = await redisService.getSortedSet(k);

        expect(alle).toHaveLength(12);
        expect(alle[0]).toEqual({value: 'm1', score: 1});
        expect(top).toHaveLength(10);
        expect(top[0]).toEqual({value: 'm12', score: 12});
    });

    it('incrementSortedSet rechnet auch mit Kommazahlen und negativ', async () => {
        const k = key('summe');

        await redisService.incrementSortedSet(k, 'user', 2.5);
        await redisService.incrementSortedSet(k, 'user', -1);

        expect(await redisService.getSortedSetAll(k)).toEqual([{value: 'user', score: 1.5}]);
        await redisService.removeFromSortedSet(k, 'user');
        expect(await redisService.getSortedSetAll(k)).toEqual([]);
    });

    // So fragt sportService.getIndexedEntries: Infinity muss als Grenze durchgehen.
    it('getSortedSetByScore versteht Infinity als Grenze', async () => {
        const k = key('zeitachse');
        await redisService.setSortedSet(k, 'alt', 1000);
        await redisService.setSortedSet(k, 'neu', 2000);

        expect(await redisService.getSortedSetByScore(k, -Infinity, Infinity)).toEqual(['alt', 'neu']);
        expect(await redisService.getSortedSetByScore(k, 1500, Infinity)).toEqual(['neu']);
    });

    it('Listen behalten die Reihenfolge, removeFromList nimmt alle Vorkommen', async () => {
        const k = key('liste');
        await redisService.addToList(k, 'a');
        await redisService.addToList(k, 'b');
        await redisService.addToList(k, 'a');

        expect(await redisService.getList(k)).toEqual(['a', 'b', 'a']);
        await redisService.removeFromList(k, 'a');
        expect(await redisService.getList(k)).toEqual(['b']);
    });

    it('Hash-Felder liefern echte Booleans', async () => {
        const k = key('hash');
        await redisService.setHashField(k, 'feld', 'wert');

        expect(await redisService.getHashAll(k)).toEqual({feld: 'wert'});
        expect(await redisService.hashFieldExists(k, 'feld')).toBe(true);
        await redisService.deleteHashField(k, 'feld');
        expect(await redisService.hashFieldExists(k, 'feld')).toBe(false);
        expect(await redisService.getHashAll(k)).toEqual({});
    });

    // addToSet muss sagen, ob der Wert neu war: daran hängt "nur einmal pro Person" beim Rollenhinweis.
    it('Sets melden, ob ein Wert neu war', async () => {
        const k = key('set');

        expect(await redisService.addToSet(k, 'a')).toBe(true);
        expect(await redisService.addToSet(k, 'a')).toBe(false);
        expect(await redisService.isSetMember(k, 'a')).toBe(true);
        expect(await redisService.getSetMembers(k)).toEqual(['a']);
        await redisService.removeFromSet(k, 'a');
        expect(await redisService.isSetMember(k, 'a')).toBe(false);
    });

    it('Zähler zählen und liefern den neuen Stand', async () => {
        const ganz = key('zaehler');
        const komma = key('betrag');

        expect(await redisService.increment(ganz)).toBe(1);
        expect(await redisService.increment(ganz)).toBe(2);
        expect(await redisService.incrementFloat(komma, 1.5)).toBe(1.5);
        expect(await redisService.incrementFloat(komma, 0.25)).toBe(1.75);
    });
});
