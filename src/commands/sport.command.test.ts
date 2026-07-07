import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/sport.handler.js', () => ({
    default: {
        handleEintragen: vi.fn(),
        handleLoeschen: vi.fn(),
        handleBearbeiten: vi.fn(),
        handleStatistik: vi.fn(),
        handleHilfe: vi.fn(),
        handleSetzen: vi.fn(),
        handleGesamt: vi.fn(),
        handleAltkilometer: vi.fn(),
        handleAltkilometerSetzen: vi.fn(),
        handleAnkuendigungskanal: vi.fn(),
        handleMeilensteinSetzen: vi.fn(),
        handleMeilensteinListe: vi.fn(),
        handleMeilensteinEntfernen: vi.fn(),
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
        ['setzen', 'handleSetzen'],
        ['gesamt', 'handleGesamt'],
        ['altkilometer', 'handleAltkilometer'],
        ['altkilometer-setzen', 'handleAltkilometerSetzen'],
        ['ankuendigungskanal', 'handleAnkuendigungskanal'],
    ] as const)('leitet Subcommand "%s" an sportHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand);

        await sportCommand.execute(interaction);

        expect(sportHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
    });

    it.each([
        ['setzen', 'handleMeilensteinSetzen'],
        ['liste', 'handleMeilensteinListe'],
        ['entfernen', 'handleMeilensteinEntfernen'],
    ] as const)('leitet Subcommand "meilenstein %s" an sportHandler.%s weiter', async (subcommand, handlerMethod) => {
        const interaction = mockInteraction(subcommand, 'meilenstein');

        await sportCommand.execute(interaction);

        expect(sportHandler[handlerMethod]).toHaveBeenCalledWith(interaction);
    });

    it('tut nichts bei einem unbekannten Subcommand', async () => {
        const interaction = mockInteraction('nicht-existent');

        await sportCommand.execute(interaction);

        for (const method of Object.values(sportHandler)) {
            expect(method).not.toHaveBeenCalled();
        }
    });

    it('registriert alle im SlashCommandBuilder definierten Top-Level-Optionen auch im Dispatch', () => {
        const definedOptions = sportCommand.data.options.map((option) => option.toJSON().name);
        const dispatchedOptions = [
            'eintragen', 'loeschen', 'bearbeiten', 'statistik',
            'hilfe', 'setzen', 'gesamt', 'altkilometer', 'altkilometer-setzen',
            'ankuendigungskanal', 'meilenstein',
        ];

        expect(definedOptions.sort()).toEqual(dispatchedOptions.sort());
    });
});
