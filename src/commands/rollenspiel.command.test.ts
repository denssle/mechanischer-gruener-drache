import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../handlers/rp.handler.js', () => ({
    default: {
        handleSuche: vi.fn(),
        handleSuchende: vi.fn(),
        handleBeenden: vi.fn(),
        handleHilfe: vi.fn(),
    }
}));

import rpHandler from '../handlers/rp.handler.js';
import rollenspielCommand from './rollenspiel.command.js';

const mockInteraction = (subcommand: string) => ({
    options: {getSubcommand: vi.fn().mockReturnValue(subcommand)},
} as any);

describe('rollenspiel.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['suche', 'handleSuche'],
        ['suchende', 'handleSuchende'],
        ['beenden', 'handleBeenden'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an rpHandler.%s weiter', async (subcommand, method) => {
        const interaction = mockInteraction(subcommand);

        await rollenspielCommand.execute(interaction);

        expect(rpHandler[method]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        await rollenspielCommand.execute(mockInteraction('nicht-existent'));

        expect(rpHandler.handleSuche).not.toHaveBeenCalled();
        expect(rpHandler.handleSuchende).not.toHaveBeenCalled();
        expect(rpHandler.handleBeenden).not.toHaveBeenCalled();
        expect(rpHandler.handleHilfe).not.toHaveBeenCalled();
    });

    // Drift-Test: jeder im SlashCommandBuilder definierte Subcommand muss auch im switch dispatchen.
    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = rollenspielCommand.data.options.map((option) => option.toJSON().name);

        expect(definedSubcommands.sort()).toEqual(['beenden', 'hilfe', 'suche', 'suchende']);
    });
});
