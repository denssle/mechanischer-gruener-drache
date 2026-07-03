import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/reactionRole.handler.js', () => ({
    default: {
        handleAdd: vi.fn(),
        handleRemove: vi.fn(),
    }
}));

import reactionRoleHandler from '../handlers/reactionRole.handler.js';
import rolleCommand from './rolle.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('rolle.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['hinzufuegen', 'handleAdd'],
        ['entfernen', 'handleRemove'],
    ] as const)('leitet Subcommand "%s" an reactionRoleHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await rolleCommand.execute(interaction);

        expect(reactionRoleHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await rolleCommand.execute(interaction);

        expect(reactionRoleHandler.handleAdd).not.toHaveBeenCalled();
        expect(reactionRoleHandler.handleRemove).not.toHaveBeenCalled();
    });

    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = rolleCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedSubcommands = ['hinzufuegen', 'entfernen'];

        expect(definedSubcommands.sort()).toEqual(dispatchedSubcommands.sort());
    });
});
