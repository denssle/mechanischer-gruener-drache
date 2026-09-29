import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags } from 'discord.js';

vi.mock('../client.js', () => ({
    default: {
        on: vi.fn(),
        commands: new Map(),
        kontextBefehle: new Map(),
    }
}));

vi.mock('./bash.handler.js', () => ({
    default: {
        handleModal: vi.fn(),
    }
}));

vi.mock('./buttonRole.handler.js', () => ({
    default: {
        handleButton: vi.fn(),
    }
}));

vi.mock('./pingPong.handler.js', () => ({
    default: {
        handleDuellButton: vi.fn(),
        handleTaktikButton: vi.fn(),
        handleRundlaufButton: vi.fn(),
        handleDoppelButton: vi.fn(),
    }
}));

vi.mock('../services/tipp.service.js', () => ({
    default: {
        merkeBenutztenBefehl: vi.fn(),
        holeZeileFuerUser: vi.fn(),
    },
    kommtTippInFrage: vi.fn(),
}));

import client from '../client.js';
import bashHandler from './bash.handler.js';
import buttonRoleHandler from './buttonRole.handler.js';
import pingPongHandler from './pingPong.handler.js';
import tippService, { kommtTippInFrage } from '../services/tipp.service.js';
import { handleInteractionCreate, zeigeGelegentlichEinenTipp } from './interaction.handler.js';

const buttonInteraction = () => ({
    isButton: () => true,
    isModalSubmit: () => false,
    isMessageContextMenuCommand: () => false,
    isChatInputCommand: () => false,
}) as any;

const commandInteraction = (overrides = {}) => ({
    isButton: () => false,
    isModalSubmit: () => false,
    isMessageContextMenuCommand: () => false,
    isChatInputCommand: () => true,
    commandName: 'sport',
    user: { id: 'user-123' },
    replied: true,
    deferred: false,
    ephemeral: false,
    followUp: vi.fn(),
    ...overrides,
}) as any;

const kontextInteraction = () => ({
    isButton: () => false,
    isModalSubmit: () => false,
    isMessageContextMenuCommand: () => true,
    isChatInputCommand: () => false,
    commandName: 'Als Bash-Zitat speichern',
    user: {id: 'user-123'},
}) as any;

describe('interaction.handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (client.commands as Map<string, any>).clear();
        (client.kontextBefehle as Map<string, any>).clear();
        vi.mocked(kommtTippInFrage).mockReturnValue(true);
    });

    describe('handleInteractionCreate', () => {
        it('reicht Buttons an alle Button-Handler weiter (jeder prüft sein Prefix selbst)', async () => {
            const interaction = buttonInteraction();

            await handleInteractionCreate(interaction);

            expect(buttonRoleHandler.handleButton).toHaveBeenCalledWith(interaction);
            expect(pingPongHandler.handleDuellButton).toHaveBeenCalledWith(interaction);
            expect(pingPongHandler.handleTaktikButton).toHaveBeenCalledWith(interaction);
            expect(pingPongHandler.handleRundlaufButton).toHaveBeenCalledWith(interaction);
            expect(pingPongHandler.handleDoppelButton).toHaveBeenCalledWith(interaction);
        });

        it('führt den passenden Command aus und merkt die Benutzung für die Tipp-Auswahl', async () => {
            const execute = vi.fn();
            (client.commands as Map<string, any>).set('sport', { execute });
            const interaction = commandInteraction();

            await handleInteractionCreate(interaction);

            expect(execute).toHaveBeenCalledWith(interaction);
            expect(tippService.merkeBenutztenBefehl).toHaveBeenCalledWith('user-123', 'sport');
        });

        it('ignoriert unbekannte Commands, ohne zu werfen', async () => {
            const interaction = commandInteraction({ commandName: 'unbekannt' });

            await expect(handleInteractionCreate(interaction)).resolves.toBeUndefined();
            expect(tippService.merkeBenutztenBefehl).not.toHaveBeenCalled();
        });

        it('ignoriert Interactions, die weder Button noch Chat-Command sind', async () => {
            const interaction = {
                isButton: () => false,
                isModalSubmit: () => false,
                isMessageContextMenuCommand: () => false,
                isChatInputCommand: () => false,
            } as any;

            await handleInteractionCreate(interaction);

            expect(buttonRoleHandler.handleButton).not.toHaveBeenCalled();
        });

        // Modal-Rückläufe gehen wie die Buttons an den Handler, der sein customId-Prefix selbst prüft.
        it('reicht Modal-Rückläufe an den Bash-Handler weiter', async () => {
            const interaction = {
                isButton: () => false,
                isModalSubmit: () => true,
                isMessageContextMenuCommand: () => false,
                isChatInputCommand: () => false,
            } as any;

            await handleInteractionCreate(interaction);

            expect(bashHandler.handleModal).toHaveBeenCalledWith(interaction);
        });

        it('führt Kontextmenü-Befehle aus der eigenen Collection aus', async () => {
            const execute = vi.fn();
            (client.kontextBefehle as Map<string, any>).set('Als Bash-Zitat speichern', {execute});
            const interaction = kontextInteraction();

            await handleInteractionCreate(interaction);

            expect(execute).toHaveBeenCalledWith(interaction);
            // Kein Tipp danach: der hängt sich an Slash-Antworten, und hier folgt oft ein Modal.
            expect(tippService.merkeBenutztenBefehl).not.toHaveBeenCalled();
        });

        it('ignoriert unbekannte Kontextmenü-Befehle, ohne zu werfen', async () => {
            await expect(handleInteractionCreate(kontextInteraction())).resolves.toBeUndefined();
        });

        it('fängt einen werfenden Kontextmenü-Befehl ab, statt die Rejection durchzureichen', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            (client.kontextBefehle as Map<string, any>).set('Als Bash-Zitat speichern', {
                execute: vi.fn().mockRejectedValue(new Error('kaputt')),
            });

            await expect(handleInteractionCreate(kontextInteraction())).resolves.toBeUndefined();

            expect(consoleError).toHaveBeenCalled();
            consoleError.mockRestore();
        });

        it('fängt einen werfenden Command ab, statt die Rejection durchzureichen', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            (client.commands as Map<string, any>).set('sport', {
                execute: vi.fn().mockRejectedValue(new Error('kaputt')),
            });

            await expect(handleInteractionCreate(commandInteraction())).resolves.toBeUndefined();

            expect(consoleError).toHaveBeenCalled();
            consoleError.mockRestore();
        });
    });

    describe('zeigeGelegentlichEinenTipp', () => {
        it('hängt die Zeile als ephemeres followUp an, wenn alles passt', async () => {
            vi.mocked(tippService.holeZeileFuerUser).mockResolvedValue('Probier mal /online.');
            const interaction = commandInteraction();

            await zeigeGelegentlichEinenTipp(interaction);

            expect(interaction.followUp).toHaveBeenCalledWith({
                content: 'Probier mal /online.',
                flags: MessageFlags.Ephemeral,
            });
        });

        it('merkt die Benutzung auch dann, wenn gar keine Antwort rausging', async () => {
            const interaction = commandInteraction({ replied: false, deferred: false });

            await zeigeGelegentlichEinenTipp(interaction);

            expect(tippService.merkeBenutztenBefehl).toHaveBeenCalledWith('user-123', 'sport');
            expect(interaction.followUp).not.toHaveBeenCalled();
        });

        it('hängt nichts an, wenn der Kontext keinen Tipp zulässt (z.B. ephemere Antwort)', async () => {
            vi.mocked(kommtTippInFrage).mockReturnValue(false);
            const interaction = commandInteraction({ ephemeral: true });

            await zeigeGelegentlichEinenTipp(interaction);

            expect(kommtTippInFrage).toHaveBeenCalledWith('sport', true);
            expect(interaction.followUp).not.toHaveBeenCalled();
        });

        it('hängt nichts an, wenn der Service diesmal keine Zeile liefert (Würfel/Cooldown)', async () => {
            vi.mocked(tippService.holeZeileFuerUser).mockResolvedValue(null);
            const interaction = commandInteraction();

            await zeigeGelegentlichEinenTipp(interaction);

            expect(interaction.followUp).not.toHaveBeenCalled();
        });

        it('lässt einen Fehler im Tipp-Pfad den Befehl nicht nachträglich scheitern', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.mocked(tippService.merkeBenutztenBefehl).mockRejectedValue(new Error('Redis weg'));

            await expect(zeigeGelegentlichEinenTipp(commandInteraction())).resolves.toBeUndefined();

            expect(consoleError).toHaveBeenCalled();
            consoleError.mockRestore();
        });
    });
});
