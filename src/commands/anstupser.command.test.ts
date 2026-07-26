import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../handlers/anstupser.handler.js', () => ({
    default: {
        handleAn: vi.fn(),
        handleAus: vi.fn(),
        handleStatus: vi.fn(),
        handleHilfe: vi.fn(),
    }
}));

import anstupserHandler from '../handlers/anstupser.handler.js';
import anstupserCommand from './anstupser.command.js';

const mockInteraction = (subcommand: string) => ({
    options: {getSubcommand: vi.fn().mockReturnValue(subcommand)},
} as any);

describe('anstupser.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['an', 'handleAn'],
        ['aus', 'handleAus'],
        ['status', 'handleStatus'],
        ['hilfe', 'handleHilfe'],
    ] as const)('leitet Subcommand "%s" an anstupserHandler.%s weiter', async (subcommand, method) => {
        const interaction = mockInteraction(subcommand);

        await anstupserCommand.execute(interaction);

        expect(anstupserHandler[method]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        await anstupserCommand.execute(mockInteraction('nicht-existent'));

        expect(anstupserHandler.handleAn).not.toHaveBeenCalled();
        expect(anstupserHandler.handleAus).not.toHaveBeenCalled();
        expect(anstupserHandler.handleStatus).not.toHaveBeenCalled();
        expect(anstupserHandler.handleHilfe).not.toHaveBeenCalled();
    });

    // Drift-Test: jeder im SlashCommandBuilder definierte Subcommand muss auch im switch dispatchen.
    it('registriert alle im SlashCommandBuilder definierten Subcommands auch im Dispatch', () => {
        const definedSubcommands = anstupserCommand.data.options.map((option) => option.toJSON().name);

        expect(definedSubcommands.sort()).toEqual(['an', 'aus', 'hilfe', 'status']);
    });

    // Bewusst für ALLE offen: der Bot schreibt niemanden ungefragt an, jede:r meldet sich selbst an.
    it('ist nicht auf Admins beschränkt', () => {
        expect(anstupserCommand.data.toJSON().default_member_permissions).toBeUndefined();
    });
});
