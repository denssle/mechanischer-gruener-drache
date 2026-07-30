import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags } from 'discord.js';

const svc = vi.hoisted(() => ({
    getLinkedName: vi.fn(),
    getRoster: vi.fn(),
    linkCharacter: vi.fn(),
    unlinkCharacter: vi.fn(),
}));
// findInRoster (rein) real lassen, nur den Service-Default mocken.
vi.mock('../services/character.service.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/character.service.js')>();
    return { ...actual, default: svc };
});

const online = vi.hoisted(() => ({ getOnline: vi.fn() }));
vi.mock('../services/online.service.js', () => ({ default: online }));

import characterHandler, {
    CHARAKTER_HELP, TOTEN_FLAVORS, randomTotenFlavor, bestimmeAktivitaet, formatAktivitaet,
} from './character.handler.js';

const ACAINE = {
    name: 'Centurio Acaine', gilde: '', ort: 'Im Haus', level: '5',
    rasse: 'Mensch', geschlecht: 'Männlich', lebt: true, zuletztDa: '5 Tage',
};

function makeInteraction(name: string | null = null) {
    return {
        user: { id: 'u1' },
        options: { getString: () => name },
        deferReply: vi.fn(),
        editReply: vi.fn(),
        reply: vi.fn(),
    } as any;
}

// Ein gerade eingeloggter Spieler, wie ihn online.service liefert (Name mit Titel-Praefix).
const ACAINE_ONLINE = {
    name: 'Centurio Acaine', ort: 'Im Haus von Tirsis', level: '5', rasse: 'Mensch', gilde: '', lebt: true,
};

describe('CharacterHandler', () => {
    beforeEach(() => {
        Object.values(svc).forEach(fn => fn.mockReset());
        online.getOnline.mockReset();
        // Standard: Online-Stand nicht verfuegbar - die Karte faellt auf "zuletzt gesehen" zurueck.
        online.getOnline.mockResolvedValue(null);
    });

    describe('verknuepfen', () => {
        it('verknüpft und zeigt die Karte, wenn der Charakter existiert', async () => {
            svc.getLinkedName.mockResolvedValue(null);
            svc.getRoster.mockResolvedValue([ACAINE]);
            const interaction = makeInteraction('Acaine');

            await characterHandler.handleVerknuepfen(interaction);

            expect(svc.linkCharacter).toHaveBeenCalledWith('u1', 'Acaine');
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0].data.title).toBe('Centurio Acaine');
        });

        it('blockt, wenn schon ein Charakter verknüpft ist', async () => {
            svc.getLinkedName.mockResolvedValue('Acaine');
            const interaction = makeInteraction('Bora');

            await characterHandler.handleVerknuepfen(interaction);

            expect(svc.linkCharacter).not.toHaveBeenCalled();
            expect(interaction.editReply.mock.calls[0][0]).toContain('bereits');
        });

        it('meldet, wenn der Charakter nicht im Roster steht', async () => {
            svc.getLinkedName.mockResolvedValue(null);
            svc.getRoster.mockResolvedValue([ACAINE]);
            const interaction = makeInteraction('Unbekannt');

            await characterHandler.handleVerknuepfen(interaction);

            expect(svc.linkCharacter).not.toHaveBeenCalled();
            expect(interaction.editReply.mock.calls[0][0]).toContain('nicht in der Kriegerliste');
        });

        it('meldet einen Abruf-Fehler, statt zu crashen', async () => {
            svc.getLinkedName.mockResolvedValue(null);
            svc.getRoster.mockResolvedValue(null);
            const interaction = makeInteraction('Acaine');

            await characterHandler.handleVerknuepfen(interaction);

            expect(interaction.editReply.mock.calls[0][0]).toContain('nicht abrufen');
        });
    });

    describe('anzeigen', () => {
        it('zeigt den verknüpften Charakter, wenn kein Name angegeben ist', async () => {
            svc.getLinkedName.mockResolvedValue('Acaine');
            svc.getRoster.mockResolvedValue([ACAINE]);
            const interaction = makeInteraction(null);

            await characterHandler.handleAnzeigen(interaction);

            expect(interaction.editReply.mock.calls[0][0].embeds[0].data.title).toBe('Centurio Acaine');
        });

        it('nutzt den angegebenen Namen direkt', async () => {
            svc.getRoster.mockResolvedValue([ACAINE]);
            const interaction = makeInteraction('acaine');

            await characterHandler.handleAnzeigen(interaction);

            expect(svc.getLinkedName).not.toHaveBeenCalled();
            expect(interaction.editReply.mock.calls[0][0].embeds[0].data.title).toBe('Centurio Acaine');
        });

        it('weist auf die Verknüpfung hin, wenn keiner verknüpft und kein Name gegeben ist', async () => {
            svc.getLinkedName.mockResolvedValue(null);
            const interaction = makeInteraction(null);

            await characterHandler.handleAnzeigen(interaction);

            expect(interaction.editReply.mock.calls[0][0]).toContain('keinen Charakter verknüpft');
        });

        it('antwortet ephemer – die Karte sieht nur die fragende Person', async () => {
            svc.getRoster.mockResolvedValue([ACAINE]);
            const interaction = makeInteraction('acaine');

            await characterHandler.handleAnzeigen(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        });

        it('meldet "gerade im Spiel" samt frischem Ort, wenn der Charakter eingeloggt ist', async () => {
            svc.getRoster.mockResolvedValue([ACAINE]);
            online.getOnline.mockResolvedValue({ players: [ACAINE_ONLINE], recent: [] });
            const interaction = makeInteraction('acaine');

            await characterHandler.handleAnzeigen(interaction);

            const beschreibung = interaction.editReply.mock.calls[0][0].embeds[0].data.description;
            expect(beschreibung).toContain('gerade im Spiel');
            // Ort aus der Online-Tabelle, nicht der aeltere Roster-Ort ("Im Haus").
            expect(beschreibung).toContain('Ort: Im Haus von Tirsis');
            expect(beschreibung).not.toContain('zuletzt gesehen');
        });

        it('faellt auf "zuletzt gesehen" zurueck, wenn der Online-Abruf scheitert', async () => {
            svc.getRoster.mockResolvedValue([ACAINE]);
            online.getOnline.mockResolvedValue(null);
            const interaction = makeInteraction('acaine');

            await characterHandler.handleAnzeigen(interaction);

            const beschreibung = interaction.editReply.mock.calls[0][0].embeds[0].data.description;
            expect(beschreibung).toContain('zuletzt gesehen: 5 Tage');
            expect(beschreibung).toContain('Ort: Im Haus');
        });

        it('gibt toten Charakteren eine Lore-Flavor-Zeile statt nur "tot"', async () => {
            svc.getRoster.mockResolvedValue([{ ...ACAINE, lebt: false }]);
            const interaction = makeInteraction('acaine');

            await characterHandler.handleAnzeigen(interaction);

            const beschreibung = interaction.editReply.mock.calls[0][0].embeds[0].data.description;
            expect(beschreibung).toMatch(/tot – /);
            expect(TOTEN_FLAVORS.some((flavor) => beschreibung.includes(flavor))).toBe(true);
        });
    });

    describe('entfernen', () => {
        it('bestätigt das Entfernen', async () => {
            svc.unlinkCharacter.mockResolvedValue(true);
            const interaction = makeInteraction();

            await characterHandler.handleEntfernen(interaction);

            expect(interaction.reply).toHaveBeenCalledWith('Deine Charakter-Verknüpfung wurde entfernt.');
        });

        it('meldet, wenn nichts verknüpft war', async () => {
            svc.unlinkCharacter.mockResolvedValue(false);
            const interaction = makeInteraction();

            await characterHandler.handleEntfernen(interaction);

            expect(interaction.reply).toHaveBeenCalledWith('Du hast keinen Charakter verknüpft.');
        });
    });

    describe('bestimmeAktivitaet', () => {
        it('erkennt den Eingeloggten trotz Titel-Praefix und gibt den Ort mit', () => {
            const stand = bestimmeAktivitaet('Acaine', { players: [ACAINE_ONLINE], recent: [] });

            expect(stand).toEqual({ stufe: 'online', ort: 'Im Haus von Tirsis' });
        });

        it('erkennt die 30-Minuten-Liste', () => {
            const stand = bestimmeAktivitaet('Acaine', { players: [], recent: ['Centurio Acaine'] });

            expect(stand).toEqual({ stufe: 'kuerzlich' });
        });

        it('bevorzugt "online" gegenueber der 30-Minuten-Liste', () => {
            const stand = bestimmeAktivitaet('Acaine', { players: [ACAINE_ONLINE], recent: ['Centurio Acaine'] });

            expect(stand).toEqual({ stufe: 'online', ort: 'Im Haus von Tirsis' });
        });

        it('gibt null, wenn der Charakter in keiner Liste steht oder der Abruf scheiterte', () => {
            expect(bestimmeAktivitaet('Acaine', { players: [], recent: ['Bora'] })).toBeNull();
            expect(bestimmeAktivitaet('Acaine', null)).toBeNull();
        });

        it('matcht nicht auf Namens-Teilstuecke', () => {
            const bora = { ...ACAINE_ONLINE, name: 'Boracaine' };

            expect(bestimmeAktivitaet('Acaine', { players: [bora], recent: [] })).toBeNull();
        });
    });

    describe('formatAktivitaet', () => {
        it('formuliert die drei Stufen', () => {
            expect(formatAktivitaet({ stufe: 'online', ort: 'Romar' }, '5 Tage')).toBe('gerade im Spiel');
            expect(formatAktivitaet({ stufe: 'kuerzlich' }, '5 Tage')).toBe('in den letzten 30 Minuten aktiv');
            expect(formatAktivitaet(null, '5 Tage')).toBe('zuletzt gesehen: 5 Tage');
        });
    });

    it('liefert immer einen der definierten Toten-Flavors', () => {
        for (let i = 0; i < 20; i++) {
            expect(TOTEN_FLAVORS).toContain(randomTotenFlavor());
        }
    });

    it('hilfe erklärt die drei Charakter-Befehle', async () => {
        const interaction = makeInteraction();

        await characterHandler.handleHilfe(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(CHARAKTER_HELP);
        expect(CHARAKTER_HELP).toContain('/charakter verknuepfen');
        expect(CHARAKTER_HELP).toContain('/charakter anzeigen');
        expect(CHARAKTER_HELP).toContain('/charakter entfernen');
    });
});
