import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/twitch.handler.js', () => ({
    default: {
        handleVerknuepfen: vi.fn(),
        handleEntfernen: vi.fn(),
        handleStatus: vi.fn(),
        handleBenachrichtigungskanal: vi.fn(),
        handleHilfe: vi.fn(),
        handleBenachrichtigungsrolle: vi.fn(),
    }
}));

import twitchHandler from '../handlers/twitch.handler.js';
import twitchCommand from './twitch.command.js';

const mockInteraction = (subcommand: string) => ({
    options: { getSubcommand: vi.fn().mockReturnValue(subcommand) },
} as any);

describe('twitch.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['verknuepfen', 'handleVerknuepfen'],
        ['entfernen', 'handleEntfernen'],
        ['status', 'handleStatus'],
        ['benachrichtigungskanal', 'handleBenachrichtigungskanal'],
        ['hilfe', 'handleHilfe'],
        ['benachrichtigungsrolle', 'handleBenachrichtigungsrolle'],
    ] as const)('leitet Subcommand "%s" an twitchHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await twitchCommand.execute(interaction);

        expect(twitchHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
        for (const [otherName] of Object.entries({
            handleVerknuepfen: 'verknuepfen', handleEntfernen: 'entfernen', handleStatus: 'status',
            handleBenachrichtigungskanal: 'benachrichtigungskanal', handleHilfe: 'hilfe',
            handleBenachrichtigungsrolle: 'benachrichtigungsrolle',
        })) {
            if (otherName !== handlerMethod) {
                expect(twitchHandler[otherName as keyof typeof twitchHandler]).not.toHaveBeenCalled();
            }
        }
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await twitchCommand.execute(interaction);

        expect(twitchHandler.handleVerknuepfen).not.toHaveBeenCalled();
        expect(twitchHandler.handleEntfernen).not.toHaveBeenCalled();
        expect(twitchHandler.handleStatus).not.toHaveBeenCalled();
        expect(twitchHandler.handleBenachrichtigungskanal).not.toHaveBeenCalled();
        expect(twitchHandler.handleHilfe).not.toHaveBeenCalled();
        expect(twitchHandler.handleBenachrichtigungsrolle).not.toHaveBeenCalled();
    });

    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = twitchCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedSubcommands = ['verknuepfen', 'entfernen', 'status', 'benachrichtigungskanal', 'hilfe', 'benachrichtigungsrolle'];

        expect(definedSubcommands.sort()).toEqual(dispatchedSubcommands.sort());
    });
});
