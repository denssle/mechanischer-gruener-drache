import {describe, it, expect, vi, beforeEach} from 'vitest';

// vi.hoisted: die Mock-Factory wird an den Dateianfang gehoben, eine normale const existiert
// dort noch nicht (siehe CLAUDE.md).
const redis = vi.hoisted(() => ({
    addToSet: vi.fn(),
    removeFromSet: vi.fn(),
    getSetMembers: vi.fn(),
    delete: vi.fn(),
    setWithExpiry: vi.fn(),
    getTimeToLive: vi.fn(),
    isSetMember: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({default: redis}));

import beobachtenService, {MAX_NAMEN, SPERRE_SEKUNDEN} from './beobachten.service.js';

describe('beobachten.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redis.getSetMembers.mockResolvedValue([]);
        redis.getTimeToLive.mockResolvedValue(-2);
    });

    it('legt den Namen in der eigenen Liste ab und vermerkt die Person als Beobachter', async () => {
        await beobachtenService.fuegeHinzu('u1', 'Acaine');

        expect(redis.addToSet).toHaveBeenCalledWith('WATCH:LISTE:u1', 'Acaine');
        expect(redis.addToSet).toHaveBeenCalledWith('WATCH:BEOBACHTER', 'u1');
    });

    // Sonst liefe der Poller dauerhaft über Leute, die niemanden mehr beobachten.
    it('nimmt die Person aus dem Beobachter-Set, wenn ihre Liste leer wird', async () => {
        redis.getSetMembers.mockResolvedValue([]);

        await beobachtenService.entferne('u1', 'Acaine');

        expect(redis.removeFromSet).toHaveBeenCalledWith('WATCH:LISTE:u1', 'Acaine');
        expect(redis.removeFromSet).toHaveBeenCalledWith('WATCH:BEOBACHTER', 'u1');
    });

    it('lässt die Person im Beobachter-Set, solange noch Namen übrig sind', async () => {
        redis.getSetMembers.mockResolvedValue(['Bora']);

        await beobachtenService.entferne('u1', 'Acaine');

        expect(redis.removeFromSet).toHaveBeenCalledWith('WATCH:LISTE:u1', 'Acaine');
        expect(redis.removeFromSet).not.toHaveBeenCalledWith('WATCH:BEOBACHTER', 'u1');
    });

    // Der Übergangs-State muss den ALTEN Stand ersetzen, nicht ergänzen - sonst gälte jemand
    // für immer als online und würde nie wieder gemeldet.
    it('ersetzt den Online-Stand, statt ihn zu ergänzen', async () => {
        await beobachtenService.setzeZuletztOnline(['acaine', 'bora']);

        expect(redis.delete).toHaveBeenCalledWith('WATCH:ONLINE');
        expect(redis.addToSet).toHaveBeenCalledWith('WATCH:ONLINE', 'acaine');
        expect(redis.addToSet).toHaveBeenCalledWith('WATCH:ONLINE', 'bora');
    });

    describe('Meldesperre', () => {
        it('setzt sie pro Person und Name mit TTL', async () => {
            await beobachtenService.sperre('u1', 'Acaine');

            expect(redis.setWithExpiry).toHaveBeenCalledWith('WATCH:GEMELDET:u1:acaine', '1', SPERRE_SEKUNDEN);
        });

        it('meldet eine laufende Sperre', async () => {
            redis.getTimeToLive.mockResolvedValue(1200);

            expect(await beobachtenService.istGesperrt('u1', 'Acaine')).toBe(true);
        });

        it.each([[-2], [-1], [0]])('meldet keine Sperre bei TTL %i', async (ttl) => {
            redis.getTimeToLive.mockResolvedValue(ttl);

            expect(await beobachtenService.istGesperrt('u1', 'Acaine')).toBe(false);
        });

        // Der Key wird kleingeschrieben, damit "acaine" und "Acaine" dieselbe Sperre teilen.
        it('unterscheidet nicht nach Groß-/Kleinschreibung', async () => {
            await beobachtenService.sperre('u1', 'AcAiNe');

            expect(redis.setWithExpiry).toHaveBeenCalledWith('WATCH:GEMELDET:u1:acaine', '1', SPERRE_SEKUNDEN);
        });
    });

    // Opt-in der Beobachteten: die Freigabe hängt an der Discord-ID der verknüpften Person.
    describe('Freigabe', () => {
        it('setzt und entfernt die Freigabe im Freigaben-Set', async () => {
            await beobachtenService.setzeFreigabe('u1');
            expect(redis.addToSet).toHaveBeenCalledWith('WATCH:FREIGABEN', 'u1');

            await beobachtenService.entferneFreigabe('u1');
            expect(redis.removeFromSet).toHaveBeenCalledWith('WATCH:FREIGABEN', 'u1');
        });

        it('fragt die Freigabe per Set-Mitgliedschaft ab', async () => {
            redis.isSetMember.mockResolvedValue(true);

            expect(await beobachtenService.hatFreigabe('u1')).toBe(true);
            expect(redis.isSetMember).toHaveBeenCalledWith('WATCH:FREIGABEN', 'u1');
        });

        it('liefert alle Freigaben für den Poll-Abgleich', async () => {
            redis.getSetMembers.mockResolvedValue(['u1', 'u2']);

            expect(await beobachtenService.holeFreigaben()).toEqual(['u1', 'u2']);
            expect(redis.getSetMembers).toHaveBeenCalledWith('WATCH:FREIGABEN');
        });
    });

    it('begrenzt die Liste auf eine überschaubare Zahl', () => {
        expect(MAX_NAMEN).toBeGreaterThan(0);
        expect(MAX_NAMEN).toBeLessThanOrEqual(25);
    });
});
