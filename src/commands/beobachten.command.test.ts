import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../handlers/beobachten.handler.js', () => ({
    default: {
        handleHinzufuegen: vi.fn(),
        handleEntfernen: vi.fn(),
        handleListe: vi.fn(),
        handleHilfe: vi.fn(),
    }
}));

import beobachtenHandler from '../handlers/beobachten.handler.js';
import beobachtenCommand from './beobachten.command.js';

const mockInteraction = (subcommand: string) => ({
    options: {getSubcommand: vi.fn().mockReturnValue(subcommand)},
} as any);

describe('beobachten.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['hinzufuegen', 'handleHinzufuegen'],
        ['entfernen', 'handleEntfernen'],
        ['liste', 'handleListe'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an beobachtenHandler.%s weiter', async (subcommand, method) => {
        const interaction = mockInteraction(subcommand);

        await beobachtenCommand.execute(interaction);

        expect(beobachtenHandler[method]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        await beobachtenCommand.execute(mockInteraction('nicht-existent'));

        expect(beobachtenHandler.handleHinzufuegen).not.toHaveBeenCalled();
        expect(beobachtenHandler.handleEntfernen).not.toHaveBeenCalled();
        expect(beobachtenHandler.handleListe).not.toHaveBeenCalled();
        expect(beobachtenHandler.handleHilfe).not.toHaveBeenCalled();
    });

    // Drift-Test: jeder im SlashCommandBuilder definierte Subcommand muss auch im switch dispatchen.
    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = beobachtenCommand.data.options.map((option) => option.toJSON().name);

        expect(definedSubcommands.sort()).toEqual(['entfernen', 'hilfe', 'hinzufuegen', 'liste']);
    });

    // Der Name ist Pflicht - ohne ihn gäbe es nichts zu beobachten bzw. zu entfernen.
    it.each(['hinzufuegen', 'entfernen'])('verlangt bei "%s" einen Namen', (name) => {
        const sub = beobachtenCommand.data.options
            .map(option => option.toJSON() as {name: string; options?: Array<{name: string; required?: boolean}>})
            .find(option => option.name === name)!;

        expect(sub.options?.[0]).toMatchObject({name: 'name', required: true});
    });

    // Bewusst für ALLE offen: jede:r pflegt die eigene Liste, niemand sieht fremde.
    it('ist nicht auf Admins beschränkt', () => {
        expect(beobachtenCommand.data.toJSON().default_member_permissions).toBeUndefined();
    });
});
