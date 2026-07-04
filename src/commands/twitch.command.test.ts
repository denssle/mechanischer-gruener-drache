import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/twitch.handler.js', () => ({
    default: {
        handleSet: vi.fn(),
        handleRemove: vi.fn(),
        handleInfo: vi.fn(),
        handleNotificationChannel: vi.fn(),
        handleHilfe: vi.fn(),
        handleNotificationRolle: vi.fn(),
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
        ['set', 'handleSet'],
        ['remove', 'handleRemove'],
        ['info', 'handleInfo'],
        ['notification-channel', 'handleNotificationChannel'],
        ['hilfe', 'handleHilfe'],
        ['notification-rolle', 'handleNotificationRolle'],
    ] as const)('leitet Subcommand "%s" an twitchHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await twitchCommand.execute(interaction);

        expect(twitchHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
        for (const [otherName] of Object.entries({
            handleSet: 'set', handleRemove: 'remove', handleInfo: 'info',
            handleNotificationChannel: 'notification-channel', handleHilfe: 'hilfe',
            handleNotificationRolle: 'notification-rolle',
        })) {
            if (otherName !== handlerMethod) {
                expect(twitchHandler[otherName as keyof typeof twitchHandler]).not.toHaveBeenCalled();
            }
        }
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await twitchCommand.execute(interaction);

        expect(twitchHandler.handleSet).not.toHaveBeenCalled();
        expect(twitchHandler.handleRemove).not.toHaveBeenCalled();
        expect(twitchHandler.handleInfo).not.toHaveBeenCalled();
        expect(twitchHandler.handleNotificationChannel).not.toHaveBeenCalled();
        expect(twitchHandler.handleHilfe).not.toHaveBeenCalled();
        expect(twitchHandler.handleNotificationRolle).not.toHaveBeenCalled();
    });

    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = twitchCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedSubcommands = ['set', 'remove', 'info', 'notification-channel', 'hilfe', 'notification-rolle'];

        expect(definedSubcommands.sort()).toEqual(dispatchedSubcommands.sort());
    });
});
