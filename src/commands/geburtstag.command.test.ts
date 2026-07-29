import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../handlers/geburtstag.handler.js', () => ({
    default: {
        handleSetzen: vi.fn(),
        handleEntfernen: vi.fn(),
        handleStatus: vi.fn(),
        handleListe: vi.fn(),
        handleHilfe: vi.fn(),
    },
    FRUEHESTES_JAHR: 1900,
}));

import geburtstagHandler from '../handlers/geburtstag.handler.js';
import geburtstagCommand from './geburtstag.command.js';

const mockInteraction = (subcommand: string) => ({
    options: {getSubcommand: vi.fn().mockReturnValue(subcommand)},
} as any);

describe('geburtstag.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['setzen', 'handleSetzen'],
        ['entfernen', 'handleEntfernen'],
        ['status', 'handleStatus'],
        ['liste', 'handleListe'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an geburtstagHandler.%s weiter', async (subcommand, method) => {
        const interaction = mockInteraction(subcommand);

        await geburtstagCommand.execute(interaction);

        expect(geburtstagHandler[method]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        await geburtstagCommand.execute(mockInteraction('nicht-existent'));

        expect(geburtstagHandler.handleSetzen).not.toHaveBeenCalled();
        expect(geburtstagHandler.handleListe).not.toHaveBeenCalled();
    });

    // Drift-Test: jeder im SlashCommandBuilder definierte Subcommand muss auch im switch dispatchen.
    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = geburtstagCommand.data.options.map((option) => option.toJSON().name);

        expect(definedSubcommands.sort()).toEqual(['entfernen', 'hilfe', 'liste', 'setzen', 'status']);
    });

    // Das Jahr ist bewusst freiwillig (siehe Datenhaltung) - hier festgenagelt, damit es nicht
    // versehentlich zur Pflicht wird.
    it('macht Tag und Monat zur Pflicht, das Jahr aber nicht', () => {
        const setzen = geburtstagCommand.data.options
            .map(option => option.toJSON())
            .find(option => option.name === 'setzen') as {options: {name: string; required?: boolean}[]};

        const pflicht = Object.fromEntries(setzen.options.map(o => [o.name, Boolean(o.required)]));
        expect(pflicht).toEqual({tag: true, monat: true, jahr: false});
    });
});
