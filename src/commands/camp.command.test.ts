import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../handlers/camp.handler.js', () => ({
    default: {
        handleRessourcen: vi.fn(),
        handleHilfe: vi.fn(),
        handleStarten: vi.fn(),
    }
}));

import campHandler from '../handlers/camp.handler.js';
import campCommand from './camp.command.js';

const mockInteraction = (subcommand: string) => ({
    options: {
        getSubcommand: vi.fn().mockReturnValue(subcommand),
    },
} as any);

describe('camp.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('definiert den Subcommand "starten"', () => {
        const command = campCommand.data.toJSON();

        expect(command.options?.some(
            option => option.name === 'starten'
        )).toBe(true);
    });

    it('leitet Subcommand "starten" an campHandler.handleStarten weiter', async () => {
        const interaction = mockInteraction('starten');

        await campCommand.execute(interaction);

        expect(campHandler.handleStarten).toHaveBeenCalledWith(interaction);
    });

    it('definiert den Camp-Command mit dem Subcommand "ressourcen"', () => {
        const command = campCommand.data.toJSON();

        expect(command.name).toBe('camp');
        expect(command.options?.some(
            option => option.name === 'ressourcen'
        )).toBe(true);
    });

    it('leitet Subcommand "ressourcen" an campHandler.handleRessourcen weiter', async () => {
        const interaction = mockInteraction('ressourcen');

        await campCommand.execute(interaction);

        expect(campHandler.handleRessourcen).toHaveBeenCalledWith(interaction);
    });

    it('definiert den Subcommand "hilfe"', () => {
        const command = campCommand.data.toJSON();

        expect(command.options?.some(
            option => option.name === 'hilfe'
        )).toBe(true);
    });

    it('leitet Subcommand "hilfe" an campHandler.handleHilfe weiter', async () => {
        const interaction = mockInteraction('hilfe');

        await campCommand.execute(interaction);

        expect(campHandler.handleHilfe).toHaveBeenCalledWith(interaction);
    });
});
