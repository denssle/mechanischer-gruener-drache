import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/sport.handler.js', () => ({
    default: {
        handleEintragen: vi.fn(),
        handleLoeschen: vi.fn(),
        handleBearbeiten: vi.fn(),
        handleStatistik: vi.fn(),
        handleHilfe: vi.fn(),
        handleGesamt: vi.fn(),
        handleMeilensteinSetzen: vi.fn(),
    }
}));

import sportHandler from '../handlers/sport.handler.js';
import sportCommand from './sport.command.js';

const mockInteraction = (subcommand: string, group: string | null = null) => ({
    options: {
        getSubcommand: vi.fn().mockReturnValue(subcommand),
        getSubcommandGroup: vi.fn().mockReturnValue(group),
    },
} as any);

describe('sport.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['eintragen', 'handleEintragen'],
        ['loeschen', 'handleLoeschen'],
        ['bearbeiten', 'handleBearbeiten'],
        ['statistik', 'handleStatistik'],
        ['hilfe', 'handleHilfe'],
        ['gesamt', 'handleGesamt'],
    ] as const)('leitet Subcommand "%s" an sportHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await sportCommand.execute(interaction);

        expect(sportHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
    });

    it('leitet Subcommand "meilenstein setzen" an sportHandler.handleMeilensteinSetzen weiter', async () => {
        const interaction = mockInteraction('setzen', 'meilenstein');

        await sportCommand.execute(interaction);

        expect(sportHandler.handleMeilensteinSetzen).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await sportCommand.execute(interaction);

        for (const method of Object.values(sportHandler)) {
            expect(method).not.toHaveBeenCalled();
        }
    });

    it('bietet beim Eintragen Kilometer und Minuten optional an', () => {
        const command = sportCommand.data.toJSON();
        const eintragen = command.options?.find(option => option.name === 'eintragen');

        expect(eintragen).toBeDefined();

        if (!eintragen || !('options' in eintragen)) {
            throw new Error('Subcommand "eintragen" hat keine Optionen');
        }

        const kilometer = eintragen.options?.find(option => option.name === 'kilometer');
        const minuten = eintragen.options?.find(option => option.name === 'minuten');

        expect(kilometer?.required).toBe(false);
        expect(minuten?.required).toBe(false);
    });

    it('bietet beim Bearbeiten Kilometer und Minuten optional an', () => {
        const command = sportCommand.data.toJSON();
        const bearbeiten = command.options?.find(option => option.name === 'bearbeiten');

        expect(bearbeiten).toBeDefined();

        if (!bearbeiten || !('options' in bearbeiten)) {
            throw new Error('Subcommand "bearbeiten" hat keine Optionen');
        }

        const kilometer = bearbeiten.options?.find(option => option.name === 'kilometer');
        const minuten = bearbeiten.options?.find(option => option.name === 'minuten');

        expect(kilometer?.required).toBe(false);
        expect(minuten?.required).toBe(false);
    });

    it('registriert alle im SlashCommandBuilder definierten Top-Level-Optionen auch im Dispatch', () => {
        const definedOptions = sportCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedOptions = [
            'eintragen', 'loeschen', 'bearbeiten', 'statistik', 'hilfe', 'gesamt', 'meilenstein',
        ];

        expect(definedOptions.sort()).toEqual(dispatchedOptions.sort());
    });
});
