import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/greeting.handler.js', () => ({
    default: {
        handleLernen: vi.fn(),
    }
}));

import greetingHandler from '../handlers/greeting.handler.js';
import morgengrussCommand from './morgengruss.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('morgengruss.command', () => {
    beforeEach(() => vi.clearAllMocks());

    it('leitet Subcommand "lernen" an greetingHandler.handleLernen weiter', async () => {
        const interaction = mockInteraction('lernen');

        await morgengrussCommand.execute(interaction);

        expect(greetingHandler.handleLernen).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        await morgengrussCommand.execute(mockInteraction('nicht-existent'));

        expect(greetingHandler.handleLernen).not.toHaveBeenCalled();
    });

    // Subcommand-Namen stehen doppelt im Code (Builder + switch) - einzige Absicherung gegen Drift.
    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = morgengrussCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedSubcommands = ['lernen'];

        expect(definedSubcommands.sort()).toEqual(dispatchedSubcommands.sort());
    });
});
