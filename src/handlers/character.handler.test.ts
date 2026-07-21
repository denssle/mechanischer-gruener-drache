import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import characterHandler, { CHARAKTER_HELP, TOTEN_FLAVORS, randomTotenFlavor } from './character.handler.js';

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

describe('CharacterHandler', () => {
    beforeEach(() => Object.values(svc).forEach(fn => fn.mockReset()));

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
