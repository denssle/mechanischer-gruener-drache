import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {MessageFlags} from 'discord.js';

vi.mock("../services/redis.service.js", () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        getSortedSetAll: vi.fn(),
        // Nur für die Gegenprobe, dass der Reset die Rekord-Rangliste nicht anfasst.
        removeFromSortedSet: vi.fn(),
    },
    REDIS_KEYS: {
        PING_PONG: "PING_PONG"
    }
}));

vi.mock("../services/pingPong.service.js", async (importOriginal) => {
    // PING_PONG_KEYS (rein) real lassen, damit der Test die echten Key-Formate prüft.
    const actual = await importOriginal<typeof import("../services/pingPong.service.js")>();
    return {
        ...actual,
        default: {
            getLastSeason: vi.fn(),
            setLastSeason: vi.fn(),
            getChampionRole: vi.fn(),
            addRuhmeshalleEintrag: vi.fn(async () => true),
            getRuhmeshalle: vi.fn(),
        }
    };
});

vi.mock("../../config.json", () => ({default: {GUILD_ID: 'guild-1'}}));
vi.mock("../client.js", () => ({default: {guilds: {cache: new Map()}}}));

import redisService from "../services/redis.service.js";
import pingPongService from "../services/pingPong.service.js";
import client from "../client.js";
import pingPongSeasonHandler, {formatMonat, monatsSchluessel, waehleSieger} from "./pingPongSeason.handler.js";

describe('PingPongSeasonHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Season-Helfer', () => {
        it('monatsSchluessel baut YYYY-MM in lokaler Zeit', () => {
            expect(monatsSchluessel(new Date(2026, 6, 29, 23, 30))).toBe('2026-07');
            expect(monatsSchluessel(new Date(2026, 0, 1))).toBe('2026-01');
        });

        it('formatMonat macht daraus den deutschen Monatsnamen', () => {
            expect(formatMonat('2026-07')).toBe('Juli 2026');
            expect(formatMonat('2025-12')).toBe('Dezember 2025');
        });

        it('formatMonat lässt Unbekanntes stehen, statt zu scheitern', () => {
            expect(formatMonat('kaputt')).toBe('kaputt');
            expect(formatMonat('2026-13')).toBe('2026-13');
        });

        it('waehleSieger nimmt den höchsten Punktestand', () => {
            expect(waehleSieger([
                {value: 'a', score: 3},
                {value: 'b', score: 9},
                {value: 'c', score: 5},
            ])).toEqual({userId: 'b', punkte: 9});
        });

        it('waehleSieger lost bei Gleichstand unter den Punktgleichen', () => {
            const gleichstand = [
                {value: 'a', score: 7},
                {value: 'b', score: 7},
                // Der Punktärmere darf nie gewinnen, egal wie das Los fällt.
                {value: 'c', score: 2},
            ];
            const zufall = vi.spyOn(Math, 'random');

            zufall.mockReturnValue(0);
            expect(waehleSieger(gleichstand)!.userId).toBe('a');

            zufall.mockReturnValue(0.99);
            expect(waehleSieger(gleichstand)!.userId).toBe('b');

            zufall.mockRestore();
        });

        it('waehleSieger liefert null bei leerer Season (niemand mit Punkten)', () => {
            expect(waehleSieger([])).toBeNull();
            expect(waehleSieger([{value: 'a', score: 0}])).toBeNull();
        });
    });

    describe('rechneSeasonAb', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(2026, 6, 1, 0, 0));
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue(null);
            // clearAllMocks leert nur die Aufrufe, nicht die Implementierungen.
            vi.mocked(pingPongService.addRuhmeshalleEintrag).mockResolvedValue(true);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('setzt den Monatsmarker beim allerersten Lauf, ohne abzurechnen', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue(null);

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(pingPongService.addRuhmeshalleEintrag).not.toHaveBeenCalled();
            expect(redisService.getSortedSetAll).not.toHaveBeenCalled();
        });

        // Der Marker wurde früher nur einmal beim Boot gesetzt - schlug das fehl, lief die
        // Abrechnung nie wieder. Deshalb hängt die Initialisierung jetzt am Minuten-Timer.
        it('setzt den fehlenden Marker auch dann, wenn er beim Start nicht gesetzt werden konnte', async () => {
            vi.mocked(pingPongService.getLastSeason)
                .mockResolvedValueOnce(null)
                .mockResolvedValue('2026-07');

            await pingPongSeasonHandler.rechneSeasonAb();
            await pingPongSeasonHandler.rechneSeasonAb();

            expect(pingPongService.setLastSeason).toHaveBeenCalledTimes(1);
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        // Bricht die Abrechnung zwischen Eintrag und Reset ab, läuft sie eine Minute später erneut
        // und sähe nur noch die Reste im Sorted Set - der echte Champion darf nicht ersetzt werden.
        it('überschreibt einen bereits eingetragenen Champion nicht und vergibt die Rolle nicht erneut', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'rest', score: 1}] as any);
            vi.mocked(pingPongService.addRuhmeshalleEintrag).mockResolvedValue(false);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');

            await pingPongSeasonHandler.rechneSeasonAb();

            // Aufgeräumt und weitergeschaltet wird trotzdem, sonst bliebe die Season offen.
            expect(redisService.delete).toHaveBeenCalledWith('PING_PONG');
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(pingPongService.getChampionRole).not.toHaveBeenCalled();
        });

        it('tut nichts, solange der Monat nicht gewechselt hat', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-07');

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(redisService.getSortedSetAll).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).not.toHaveBeenCalled();
        });

        it('trägt den Sieger des Vormonats ein, setzt die Scores zurück und schreibt den Marker', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([
                {value: 'user-1', score: 12},
                {value: 'user-2', score: 3},
            ] as any);

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(pingPongService.addRuhmeshalleEintrag).toHaveBeenCalledWith('2026-06', 'user-1', 12);
            // Der Score liegt doppelt: Einzelkey je User UND Sorted Set - beides muss weg.
            expect(redisService.delete).toHaveBeenCalledWith('user-1PING_PONG');
            expect(redisService.delete).toHaveBeenCalledWith('user-2PING_PONG');
            expect(redisService.delete).toHaveBeenCalledWith('PING_PONG');
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        it('rührt Serie und Rekord beim Reset nicht an', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'user-1', score: 4}] as any);

            await pingPongSeasonHandler.rechneSeasonAb();

            const geloescht = vi.mocked(redisService.delete).mock.calls.map(([key]) => key);
            expect(geloescht).not.toContain('PING_PONG:SERIE:user-1');
            expect(geloescht).not.toContain('PING_PONG:REKORD:user-1');
            // Auch die Rekord-Rangliste ist keine Saisonleistung: sie sammelt persönliche
            // Bestmarken und überdauert den Monatswechsel wie der Einzelkey daneben.
            expect(geloescht).not.toContain('PING_PONG:REKORD_HIGHSCORE');
            expect(vi.mocked(redisService.removeFromSortedSet).mock.calls.map(([key]) => key))
                .not.toContain('PING_PONG:REKORD_HIGHSCORE');
        });

        it('holt einen verpassten Monatswechsel nach (Bot war aus)', async () => {
            vi.setSystemTime(new Date(2026, 6, 4, 9, 0));
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-05');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'user-1', score: 8}] as any);

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(pingPongService.addRuhmeshalleEintrag).toHaveBeenCalledWith('2026-05', 'user-1', 8);
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        it('legt bei leerer Season keinen Eintrag an, schreibt aber den Marker fort', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([] as any);

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(pingPongService.addRuhmeshalleEintrag).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
        });

        it('rechnet auch ohne konfigurierte Champion-Rolle ab (nur Log statt Abbruch)', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'user-1', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue(null);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
        });

        it('nimmt die Champion-Rolle dem bisherigen Träger ab und gibt sie dem neuen Sieger', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');

            const altTraeger = {id: 'alt', roles: {remove: vi.fn().mockResolvedValue(undefined)}};
            const neuerChamp = {id: 'neu', roles: {add: vi.fn().mockResolvedValue(undefined)}};
            const rolle = {id: 'rolle-1', members: new Map([['alt', altTraeger]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {
                        permissions: {has: () => true},
                        roles: {highest: {comparePositionTo: () => 1}},
                    },
                    fetch: vi.fn(async () => neuerChamp),
                },
            } as any);

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(altTraeger.roles.remove).toHaveBeenCalledWith(rolle);
            expect(neuerChamp.roles.add).toHaveBeenCalledWith(rolle);
            client.guilds.cache.clear();
        });

        it('vergibt die Rolle nicht, wenn sie über der Bot-Rolle steht - rechnet aber ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');

            const fetch = vi.fn();
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', {id: 'rolle-1', members: new Map()}]])},
                members: {
                    me: {
                        permissions: {has: () => true},
                        roles: {highest: {comparePositionTo: () => -1}},
                    },
                    fetch,
                },
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(fetch).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });
        it('vergibt die Rolle nicht, wenn sie gelöscht wurde - rechnet aber ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-weg');
            const fetch = vi.fn();
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map()},
                members: {me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}}, fetch},
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(fetch).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        it('vergibt die Rolle nicht ohne das Recht "Rollen verwalten" - rechnet aber ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const fetch = vi.fn();
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', {id: 'rolle-1', members: new Map()}]])},
                members: {me: {permissions: {has: () => false}, roles: {highest: {comparePositionTo: () => 1}}}, fetch},
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(fetch).not.toHaveBeenCalled();
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        // Der Ruhmeshallen-Eintrag steht dann trotzdem schon - nur die Rolle entfällt.
        it('kommt damit klar, dass der Champion den Server verlassen hat', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'weg', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const altTraeger = {id: 'alt', roles: {remove: vi.fn().mockResolvedValue(undefined)}};
            const rolle = {id: 'rolle-1', members: new Map([['alt', altTraeger]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}},
                    fetch: vi.fn().mockRejectedValue(new Error('Unknown Member')),
                },
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongSeasonHandler.rechneSeasonAb();

            // Der bisherige Träger ist die Rolle trotzdem los - der Titel ist abgelaufen.
            expect(altTraeger.roles.remove).toHaveBeenCalled();
            expect(pingPongService.addRuhmeshalleEintrag).toHaveBeenCalledWith('2026-06', 'weg', 5);
            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        // Best-effort: scheitert das Abnehmen bei einer Person, darf der neue Champion trotzdem
        // seine Rolle bekommen.
        it('vergibt die Rolle auch dann, wenn das Abnehmen beim Vorgänger scheitert', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const altTraeger = {id: 'alt', roles: {remove: vi.fn().mockRejectedValue(new Error('Missing Permissions'))}};
            const neuerChamp = {id: 'neu', roles: {add: vi.fn().mockResolvedValue(undefined)}};
            const rolle = {id: 'rolle-1', members: new Map([['alt', altTraeger]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}},
                    fetch: vi.fn(async () => neuerChamp),
                },
            } as any);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(neuerChamp.roles.add).toHaveBeenCalledWith(rolle);
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
            client.guilds.cache.clear();
        });

        // Die Abrechnung selbst ist da schon durch - sie darf an der Rolle nicht nachträglich scheitern.
        it('fängt einen Fehler beim Vergeben der Rolle ab', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'neu', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockRejectedValue(new Error('Redis kaputt'));
            const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(pingPongSeasonHandler.rechneSeasonAb()).resolves.toBeUndefined();

            expect(pingPongService.setLastSeason).toHaveBeenCalledWith('2026-07');
            expect(fehler).toHaveBeenCalled();
            fehler.mockRestore();
        });

        it('nimmt dem Sieger die Rolle nicht ab, wenn er sie schon trägt', async () => {
            vi.mocked(pingPongService.getLastSeason).mockResolvedValue('2026-06');
            vi.mocked(redisService.getSortedSetAll).mockResolvedValue([{value: 'titelverteidiger', score: 5}] as any);
            vi.mocked(pingPongService.getChampionRole).mockResolvedValue('rolle-1');
            const champ = {
                id: 'titelverteidiger',
                roles: {remove: vi.fn().mockResolvedValue(undefined), add: vi.fn().mockResolvedValue(undefined)},
            };
            const rolle = {id: 'rolle-1', members: new Map([['titelverteidiger', champ]])};
            client.guilds.cache.set('guild-1', {
                roles: {cache: new Map([['rolle-1', rolle]])},
                members: {
                    me: {permissions: {has: () => true}, roles: {highest: {comparePositionTo: () => 1}}},
                    fetch: vi.fn(async () => champ),
                },
            } as any);

            await pingPongSeasonHandler.rechneSeasonAb();

            expect(champ.roles.remove).not.toHaveBeenCalled();
            expect(champ.roles.add).toHaveBeenCalledWith(rolle);
            client.guilds.cache.clear();
        });
    });

    describe('handleRuhmeshalle', () => {
        const mockInteraction = () => ({reply: vi.fn()} as any);

        it('listet die Champions und pingt dabei niemanden an', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockResolvedValue([
                {monat: '2026-06', userId: 'user-1', punkte: 12},
                {monat: '2026-05', userId: 'user-2', punkte: 9},
            ]);
            const interaction = mockInteraction();

            await pingPongSeasonHandler.handleRuhmeshalle(interaction);

            const antwort = interaction.reply.mock.calls[0][0];
            expect(antwort.content).toContain('Juni 2026: <@user-1> mit **12** Punkten');
            expect(antwort.content).toContain('Mai 2026: <@user-2> mit **9** Punkten');
            // Pflicht: sonst pingt jede Abfrage sämtliche Ex-Champions.
            expect(antwort.allowedMentions).toEqual({parse: []});
        });

        it('meldet eine leere Ruhmeshalle, statt eine leere Liste zu posten', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockResolvedValue([]);
            const interaction = mockInteraction();

            await pingPongSeasonHandler.handleRuhmeshalle(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('noch leer');
        });

        // Ganze Monate weglassen statt Zeilen abschneiden - Discord lehnt >2000 Zeichen ab.
        it('lässt ältere Monate weg, statt am Zeichenlimit zu scheitern', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockResolvedValue(
                Array.from({length: 200}, (_, i) => ({
                    monat: `2026-${String((i % 12) + 1).padStart(2, '0')}`,
                    userId: `user-${i}`.padEnd(20, '0'),
                    punkte: 10,
                }))
            );
            const interaction = mockInteraction();

            await pingPongSeasonHandler.handleRuhmeshalle(interaction);

            const {content} = interaction.reply.mock.calls[0][0];
            expect(content.length).toBeLessThanOrEqual(2000);
            // Der jüngste Monat steht drin, der 200. nicht mehr.
            expect(content).toContain('user-0'.padEnd(20, '0'));
            expect(content).not.toContain('user-199');
        });

        it('fängt einen Redis-Fehler ab', async () => {
            vi.mocked(pingPongService.getRuhmeshalle).mockRejectedValue(new Error('Redis kaputt'));
            const interaction = mockInteraction();

            await pingPongSeasonHandler.handleRuhmeshalle(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
        });
    });
});
