import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/character.handler.js', () => ({
    default: {
        handleVerknuepfen: vi.fn(),
        handleAnzeigen: vi.fn(),
        handleEntfernen: vi.fn(),
        handleHilfe: vi.fn(),
    }
}));

import characterHandler from '../handlers/character.handler.js';
import characterCommand from './character.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('character.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['verknuepfen', 'handleVerknuepfen'],
        ['anzeigen', 'handleAnzeigen'],
        ['entfernen', 'handleEntfernen'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an characterHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await characterCommand.execute(interaction);

        expect(characterHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await characterCommand.execute(interaction);

        expect(characterHandler.handleVerknuepfen).not.toHaveBeenCalled();
        expect(characterHandler.handleAnzeigen).not.toHaveBeenCalled();
        expect(characterHandler.handleEntfernen).not.toHaveBeenCalled();
        expect(characterHandler.handleHilfe).not.toHaveBeenCalled();
    });

    // Die Subcommand-Namen stehen doppelt im Code (Builder + switch) - das hier ist die
    // einzige Absicherung gegen Drift zwischen beiden (wie bei twitch/sport).
    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = characterCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedSubcommands = ['verknuepfen', 'anzeigen', 'entfernen', 'hilfe'];

        expect(definedSubcommands.sort()).toEqual(dispatchedSubcommands.sort());
    });
});
