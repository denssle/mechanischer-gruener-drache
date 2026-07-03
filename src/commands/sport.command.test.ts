import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/sport.handler.js', () => ({
    default: {
        handleHinzufuegen: vi.fn(),
        handleLoeschen: vi.fn(),
        handleBearbeiten: vi.fn(),
        handleStatistik: vi.fn(),
        handleHilfe: vi.fn(),
        handleSetzen: vi.fn(),
        handleGesamt: vi.fn(),
        handleLegacy: vi.fn(),
    }
}));

import sportHandler from '../handlers/sport.handler.js';
import sportCommand from './sport.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('sport.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['hinzufuegen', 'handleHinzufuegen'],
        ['loeschen', 'handleLoeschen'],
        ['bearbeiten', 'handleBearbeiten'],
        ['statistik', 'handleStatistik'],
        ['hilfe', 'handleHilfe'],
        ['setzen', 'handleSetzen'],
        ['gesamt', 'handleGesamt'],
        ['legacy', 'handleLegacy'],
    ] as const)('leitet Subcommand "%s" an sportHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await sportCommand.execute(interaction);

        expect(sportHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await sportCommand.execute(interaction);

        for (const method of Object.values(sportHandler)) {
            expect(method).not.toHaveBeenCalled();
        }
    });

    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = sportCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedSubcommands = [
            'hinzufuegen', 'loeschen', 'bearbeiten', 'statistik',
            'hilfe', 'setzen', 'gesamt', 'legacy',
        ];

        expect(definedSubcommands.sort()).toEqual(dispatchedSubcommands.sort());
    });
});
