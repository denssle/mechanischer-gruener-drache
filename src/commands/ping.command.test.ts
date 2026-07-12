import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/pingPong.handler.js', () => ({
    default: {
        handleHerausfordern: vi.fn(),
        handleAnsageduell: vi.fn(),
        handlePingPongHighscore: vi.fn(),
        handleHilfe: vi.fn(),
    }
}));

import pingPongHandler from '../handlers/pingPong.handler.js';
import pingCommand from './ping.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('ping.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['herausfordern', 'handleHerausfordern'],
        ['ansageduell', 'handleAnsageduell'],
        ['bestenliste', 'handlePingPongHighscore'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an pingPongHandler.%s weiter', async (subcommand, method) => {
        const interaction = mockInteraction(subcommand);

        await pingCommand.execute(interaction);

        expect(pingPongHandler[method]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        await pingCommand.execute(mockInteraction('nicht-existent'));

        expect(pingPongHandler.handleHerausfordern).not.toHaveBeenCalled();
        expect(pingPongHandler.handleAnsageduell).not.toHaveBeenCalled();
        expect(pingPongHandler.handlePingPongHighscore).not.toHaveBeenCalled();
        expect(pingPongHandler.handleHilfe).not.toHaveBeenCalled();
    });

    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = pingCommand.data.options.map((option) => option.toJSON().name);

        expect(definedSubcommands.sort()).toEqual(['ansageduell', 'bestenliste', 'herausfordern', 'hilfe']);
    });
});
