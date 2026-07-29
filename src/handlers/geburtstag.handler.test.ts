import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {MessageFlags} from 'discord.js';

const svc = vi.hoisted(() => ({
    setGeburtstag: vi.fn(),
    entferneGeburtstag: vi.fn(),
    getGeburtstag: vi.fn(),
    getAlle: vi.fn(),
    getChannel: vi.fn(),
    setChannel: vi.fn(),
    getLastPostDay: vi.fn(),
    setLastPostDay: vi.fn(),
}));
vi.mock('../services/geburtstag.service.js', () => ({default: svc}));

vi.mock('../../config.json', () => ({default: {GUILD_ID: 'guild-1'}}));

const channelsFetch = vi.hoisted(() => vi.fn());
const mitglieder = vi.hoisted(() => new Set<string>());
const guilds = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../client.js', () => ({
    default: {channels: {fetch: channelsFetch}, guilds: {cache: guilds}}
}));

import geburtstagHandler, {
    berechneAlter,
    formatDatum,
    GEBURTSTAG_HILFE,
    GRATULATIONS_STUNDE,
    istGueltigesDatum,
    istHeuteGeburtstag,
    naechstesVorkommen,
    waehleGlueckwunsch,
} from './geburtstag.handler.js';
import {ALTERS_ZEILEN, GEBURTSTAGS_GLUECKWUENSCHE} from '../data/geburtstagsglueckwuensche.js';

guilds.set('guild-1', {members: {cache: mitglieder}});

// Ein Datum am Gratulations-Zeitpunkt (Stunde >= GRATULATIONS_STUNDE), damit die Zeitprüfung
// im täglichen Post nicht zufällig von der echten Uhrzeit abhängt.
const anTag = (jahr: number, monat: number, tag: number) =>
    new Date(jahr, monat - 1, tag, GRATULATIONS_STUNDE, 5);

const mockInteraction = (optionen: Record<string, number | null> = {}) => ({
    user: {id: 'u1'},
    options: {
        getInteger: vi.fn((name: string) => optionen[name] ?? null),
    },
    reply: vi.fn(),
} as any);

describe('istGueltigesDatum', () => {
    it('nimmt gültige Tag/Monat-Kombinationen an', () => {
        expect(istGueltigesDatum(1, 1, null)).toBe(true);
        expect(istGueltigesDatum(31, 12, null)).toBe(true);
        expect(istGueltigesDatum(5, 3, 1990)).toBe(true);
    });

    it('lehnt Tage ab, die es im Monat nicht gibt', () => {
        expect(istGueltigesDatum(31, 2, null)).toBe(false);
        expect(istGueltigesDatum(31, 4, null)).toBe(false);
        expect(istGueltigesDatum(0, 5, null)).toBe(false);
        expect(istGueltigesDatum(12, 13, null)).toBe(false);
    });

    // Ohne Jahr ist der 29.02. ein völlig normaler Geburtstag - nur MIT Jahr muss es ein Schaltjahr sein.
    it('erlaubt den 29. Februar ohne Jahr, prüft ihn aber mit Jahr', () => {
        expect(istGueltigesDatum(29, 2, null)).toBe(true);
        expect(istGueltigesDatum(29, 2, 1996)).toBe(true);
        expect(istGueltigesDatum(29, 2, 1995)).toBe(false);
    });

    it('lehnt unplausible Jahre ab', () => {
        expect(istGueltigesDatum(5, 3, 1899)).toBe(false);
        expect(istGueltigesDatum(5, 3, new Date().getFullYear() + 1)).toBe(false);
    });
});

describe('istHeuteGeburtstag', () => {
    it('erkennt den Tag selbst', () => {
        expect(istHeuteGeburtstag({tag: 5, monat: 3, jahr: null}, anTag(2026, 3, 5))).toBe(true);
        expect(istHeuteGeburtstag({tag: 5, monat: 3, jahr: null}, anTag(2026, 3, 6))).toBe(false);
        expect(istHeuteGeburtstag({tag: 5, monat: 3, jahr: null}, anTag(2026, 4, 5))).toBe(false);
    });

    // 2028 ist ein Schaltjahr, 2026 nicht: dort wird am 01.03. gratuliert (§ 188 Abs. 3 BGB).
    it('gratuliert am 29.02. im Schaltjahr, sonst am 01.03.', () => {
        const schalttagKind = {tag: 29, monat: 2, jahr: null};

        expect(istHeuteGeburtstag(schalttagKind, anTag(2028, 2, 29))).toBe(true);
        expect(istHeuteGeburtstag(schalttagKind, anTag(2028, 3, 1))).toBe(false);

        expect(istHeuteGeburtstag(schalttagKind, anTag(2026, 3, 1))).toBe(true);
        expect(istHeuteGeburtstag(schalttagKind, anTag(2026, 2, 28))).toBe(false);
    });
});

describe('berechneAlter', () => {
    it('liefert null ohne hinterlegtes Jahr', () => {
        expect(berechneAlter({tag: 5, monat: 3, jahr: null}, anTag(2026, 3, 5))).toBeNull();
    });

    it('zählt das laufende Jahr erst ab dem Geburtstag mit', () => {
        const geburtstag = {tag: 5, monat: 3, jahr: 1990};

        expect(berechneAlter(geburtstag, anTag(2026, 3, 5))).toBe(36);
        expect(berechneAlter(geburtstag, anTag(2026, 3, 4))).toBe(35);
        expect(berechneAlter(geburtstag, anTag(2026, 12, 1))).toBe(36);
    });
});

describe('naechstesVorkommen', () => {
    it('nimmt den heutigen Geburtstag noch mit', () => {
        const naechster = naechstesVorkommen({tag: 5, monat: 3, jahr: null}, anTag(2026, 3, 5));

        expect(naechster.getFullYear()).toBe(2026);
        expect(naechster.getMonth()).toBe(2);
    });

    it('springt ins nächste Jahr, wenn der Tag vorbei ist', () => {
        const naechster = naechstesVorkommen({tag: 5, monat: 3, jahr: null}, anTag(2026, 6, 1));

        expect(naechster.getFullYear()).toBe(2027);
    });
});

describe('formatDatum', () => {
    it('schreibt den Monat aus und hängt das Jahr nur an, wenn es da ist', () => {
        expect(formatDatum({tag: 5, monat: 3, jahr: null})).toBe('5. März');
        expect(formatDatum({tag: 29, monat: 2, jahr: 1996})).toBe('29. Februar 1996');
    });
});

describe('Glückwunsch-Listen', () => {
    it('enthalten keine Duplikate', () => {
        expect(new Set(GEBURTSTAGS_GLUECKWUENSCHE).size).toBe(GEBURTSTAGS_GLUECKWUENSCHE.length);
        expect(new Set(ALTERS_ZEILEN).size).toBe(ALTERS_ZEILEN.length);
    });

    // Ohne den Platzhalter wüsste niemand, wem gratuliert wird.
    it('enthalten in jedem Glückwunsch den {name}-Platzhalter', () => {
        for (const zeile of GEBURTSTAGS_GLUECKWUENSCHE) {
            expect(zeile, zeile).toContain('{name}');
        }
    });

    it('enthalten in jeder Alterszeile den {alter}-Platzhalter', () => {
        for (const zeile of ALTERS_ZEILEN) {
            expect(zeile, zeile).toContain('{alter}');
        }
    });
});

describe('waehleGlueckwunsch', () => {
    it('setzt den Namen ein und lässt das Alter ohne Jahr weg', () => {
        const text = waehleGlueckwunsch('<@u1>', null);

        expect(text).toContain('<@u1>');
        expect(text).not.toContain('{name}');
        expect(ALTERS_ZEILEN.some(z => text.includes(z.replace('{alter}', '36')))).toBe(false);
    });

    it('hängt die Alterszeile an, wenn ein Alter bekannt ist', () => {
        const text = waehleGlueckwunsch('<@u1>', 36);

        expect(text).toContain('36');
        expect(text).not.toContain('{alter}');
    });
});

describe('GeburtstagHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mitglieder.clear();
        mitglieder.add('u1');
    });

    describe('handleSetzen', () => {
        it('speichert ein gültiges Datum und antwortet ephemer', async () => {
            const interaction = mockInteraction({tag: 5, monat: 3, jahr: 1990});

            await geburtstagHandler.handleSetzen(interaction);

            expect(svc.setGeburtstag).toHaveBeenCalledWith('u1', {tag: 5, monat: 3, jahr: 1990});
            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.flags).toBe(MessageFlags.Ephemeral);
            expect(reply.content).toContain('5. März 1990');
        });

        it('speichert auch ohne Jahr und sagt, dass dann kein Alter genannt wird', async () => {
            const interaction = mockInteraction({tag: 5, monat: 3});

            await geburtstagHandler.handleSetzen(interaction);

            expect(svc.setGeburtstag).toHaveBeenCalledWith('u1', {tag: 5, monat: 3, jahr: null});
            expect(interaction.reply.mock.calls[0][0].content).toContain('kein Alter');
        });

        it('lehnt ein unmögliches Datum ab, ohne zu speichern', async () => {
            const interaction = mockInteraction({tag: 31, monat: 2});

            await geburtstagHandler.handleSetzen(interaction);

            expect(svc.setGeburtstag).not.toHaveBeenCalled();
            expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
        });
    });

    describe('handleEntfernen', () => {
        it('entfernt einen bestehenden Eintrag', async () => {
            svc.getGeburtstag.mockResolvedValue({tag: 5, monat: 3, jahr: null});
            const interaction = mockInteraction();

            await geburtstagHandler.handleEntfernen(interaction);

            expect(svc.entferneGeburtstag).toHaveBeenCalledWith('u1');
        });

        it('meldet, wenn gar nichts gespeichert war, und entfernt nichts', async () => {
            svc.getGeburtstag.mockResolvedValue(null);
            const interaction = mockInteraction();

            await geburtstagHandler.handleEntfernen(interaction);

            expect(svc.entferneGeburtstag).not.toHaveBeenCalled();
        });
    });

    describe('handleStatus', () => {
        it('nennt das gespeicherte Datum ephemer', async () => {
            svc.getGeburtstag.mockResolvedValue({tag: 5, monat: 3, jahr: null});
            const interaction = mockInteraction();

            await geburtstagHandler.handleStatus(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('5. März');
            expect(reply.flags).toBe(MessageFlags.Ephemeral);
        });
    });

    describe('handleListe', () => {
        it('listet nach dem nächsten Vorkommen sortiert und pingt dabei niemanden', async () => {
            mitglieder.add('u2');
            svc.getAlle.mockResolvedValue({
                u1: {tag: 31, monat: 12, jahr: null},
                u2: {tag: 1, monat: 1, jahr: 2000},
            });
            const interaction = mockInteraction();

            await geburtstagHandler.handleListe(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.allowedMentions).toEqual({parse: []});
            expect(reply.content).toContain('<@u1>');
            expect(reply.content).toContain('<@u2>');
        });

        // Wer den Server verlassen hat, steht noch im Hash - eine tote Erwähnung will die Liste nicht.
        it('überspringt Einträge von Leuten, die nicht mehr auf dem Server sind', async () => {
            svc.getAlle.mockResolvedValue({
                u1: {tag: 5, monat: 3, jahr: null},
                weg: {tag: 6, monat: 3, jahr: null},
            });
            const interaction = mockInteraction();

            await geburtstagHandler.handleListe(interaction);

            expect(interaction.reply.mock.calls[0][0].content).not.toContain('<@weg>');
        });

        it('meldet eine leere Liste als Text', async () => {
            svc.getAlle.mockResolvedValue({});
            const interaction = mockInteraction();

            await geburtstagHandler.handleListe(interaction);

            expect(typeof interaction.reply.mock.calls[0][0]).toBe('string');
        });
    });

    describe('handleHilfe', () => {
        it('antwortet mit der Übersicht', async () => {
            const interaction = mockInteraction();

            await geburtstagHandler.handleHilfe(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(GEBURTSTAG_HILFE);
        });
    });

    describe('posteGeburtstagsgruesse', () => {
        const send = vi.fn();

        beforeEach(() => {
            send.mockReset().mockResolvedValue(undefined);
            channelsFetch.mockResolvedValue({send});
            svc.getChannel.mockResolvedValue('c1');
            svc.getLastPostDay.mockResolvedValue(null);
            vi.useFakeTimers();
        });

        // Uhr wieder zurückdrehen, sonst laufen die folgenden Tests an einer eingefrorenen Zeit.
        afterEach(() => {
            vi.useRealTimers();
        });

        const setzeZeit = (jahr: number, monat: number, tag: number, stunde: number) =>
            vi.setSystemTime(new Date(jahr, monat - 1, tag, stunde, 0));

        it('gratuliert dem Geburtstagskind und markiert den Tag', async () => {
            setzeZeit(2026, 3, 5, GRATULATIONS_STUNDE);
            svc.getAlle.mockResolvedValue({u1: {tag: 5, monat: 3, jahr: 1990}});

            await geburtstagHandler.posteGeburtstagsgruesse();

            expect(send).toHaveBeenCalledTimes(1);
            expect(send.mock.calls[0][0]).toContain('<@u1>');
            expect(send.mock.calls[0][0]).toContain('36');
            expect(svc.setLastPostDay).toHaveBeenCalledWith('2026-03-05');
        });

        it('postet vor der Gratulationszeit noch nichts', async () => {
            setzeZeit(2026, 3, 5, GRATULATIONS_STUNDE - 1);
            svc.getAlle.mockResolvedValue({u1: {tag: 5, monat: 3, jahr: null}});

            await geburtstagHandler.posteGeburtstagsgruesse();

            expect(send).not.toHaveBeenCalled();
            expect(svc.setLastPostDay).not.toHaveBeenCalled();
        });

        it('postet nicht zweimal am selben Tag', async () => {
            setzeZeit(2026, 3, 5, GRATULATIONS_STUNDE);
            svc.getLastPostDay.mockResolvedValue('2026-03-05');
            svc.getAlle.mockResolvedValue({u1: {tag: 5, monat: 3, jahr: null}});

            await geburtstagHandler.posteGeburtstagsgruesse();

            expect(send).not.toHaveBeenCalled();
        });

        it('hakt einen Tag ohne Geburtstage ohne Post ab', async () => {
            setzeZeit(2026, 3, 6, GRATULATIONS_STUNDE);
            svc.getAlle.mockResolvedValue({u1: {tag: 5, monat: 3, jahr: null}});

            await geburtstagHandler.posteGeburtstagsgruesse();

            expect(send).not.toHaveBeenCalled();
            expect(svc.setLastPostDay).toHaveBeenCalledWith('2026-03-06');
        });

        // Ohne abrufbaren Kanal bleibt der Marker stehen, damit der Glückwunsch nachgeholt wird,
        // sobald ein Kanal existiert (Muster wie beim Mitternachts-Kilometerstand).
        it('markiert den Tag NICHT, wenn kein Kanal abrufbar ist', async () => {
            setzeZeit(2026, 3, 5, GRATULATIONS_STUNDE);
            svc.getAlle.mockResolvedValue({u1: {tag: 5, monat: 3, jahr: null}});
            channelsFetch.mockRejectedValue(new Error('weg'));

            await geburtstagHandler.posteGeburtstagsgruesse();

            expect(svc.setLastPostDay).not.toHaveBeenCalled();
        });

        it('überspringt Leute, die nicht mehr auf dem Server sind', async () => {
            setzeZeit(2026, 3, 5, GRATULATIONS_STUNDE);
            svc.getAlle.mockResolvedValue({weg: {tag: 5, monat: 3, jahr: null}});

            await geburtstagHandler.posteGeburtstagsgruesse();

            expect(send).not.toHaveBeenCalled();
        });

        it('lässt einen Redis-Fehler nicht durchschlagen', async () => {
            setzeZeit(2026, 3, 5, GRATULATIONS_STUNDE);
            svc.getAlle.mockRejectedValue(new Error('Redis weg'));

            await expect(geburtstagHandler.posteGeburtstagsgruesse()).resolves.toBeUndefined();
        });
    });
});
