import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/event.handler.js', () => ({
    default: {
        handleSetzen: vi.fn(),
        handleCountdown: vi.fn(),
        handleEntfernen: vi.fn(),
        handleHilfe: vi.fn(),
    }
}));

import eventHandler from '../handlers/event.handler.js';
import eventCommand from './event.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('event.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['setzen', 'handleSetzen'],
        ['countdown', 'handleCountdown'],
        ['entfernen', 'handleEntfernen'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an eventHandler.%s weiter', async (subcommand, method) => {
        const interaction = mockInteraction(subcommand);

        await eventCommand.execute(interaction);

        expect(eventHandler[method]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await eventCommand.execute(interaction);

        expect(eventHandler.handleSetzen).not.toHaveBeenCalled();
        expect(eventHandler.handleCountdown).not.toHaveBeenCalled();
        expect(eventHandler.handleEntfernen).not.toHaveBeenCalled();
        expect(eventHandler.handleHilfe).not.toHaveBeenCalled();
    });

    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = eventCommand.data.options.map((option) => option.toJSON().name);

        expect(definedSubcommands.sort()).toEqual(['countdown', 'entfernen', 'hilfe', 'setzen']);
    });
});
