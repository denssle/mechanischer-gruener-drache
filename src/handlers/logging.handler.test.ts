import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';

vi.mock('../services/logging.service.js', () => ({
    default: {
        setLogChannel: vi.fn(),
        getLogChannel: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {
        on: vi.fn(),
        channels: { fetch: vi.fn() },
    }
}));

import loggingService from '../services/logging.service.js';
import client from '../client.js';
import loggingHandler from './logging.handler.js';

const mockMessage = (overrides = {}) => ({
    guild: { id: 'guild-1' },
    author: { tag: 'User#0001', bot: false },
    partial: false,
    content: 'Hallo Welt',
    channelId: 'source-channel',
    ...overrides,
});

describe('LoggingHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('handleSetChannel', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getChannel: vi.fn().mockReturnValue({ id: 'log-channel-1' }) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await loggingHandler.handleSetChannel(interaction);

            expect(loggingService.setLogChannel).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('setzt den Log-Channel mit Administrator-Rechten', async () => {
            const interaction = mockInteraction(true);

            await loggingHandler.handleSetChannel(interaction);

            expect(interaction.memberPermissions.has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
            expect(loggingService.setLogChannel).toHaveBeenCalledWith('log-channel-1');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('log-channel-1'));
        });
    });

    describe('handleMessageDelete', () => {
        it('ignoriert Nachrichten außerhalb einer Guild (DMs)', async () => {
            const message = mockMessage({ guild: null });

            await loggingHandler.handleMessageDelete(message as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('ignoriert Bot-Nachrichten', async () => {
            const message = mockMessage({ author: { tag: 'Bot#0000', bot: true } });

            await loggingHandler.handleMessageDelete(message as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);
            const message = mockMessage();

            await loggingHandler.handleMessageDelete(message as any);

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt die gelöschte Nachricht mit Inhalt', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const message = mockMessage({ content: 'Geheime Nachricht' });

            await loggingHandler.handleMessageDelete(message as any);

            expect(client.channels.fetch).toHaveBeenCalledWith('log-channel-1');
            expect(send).toHaveBeenCalledWith(expect.stringContaining('User#0001'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Geheime Nachricht'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('<#source-channel>'));
        });

        it('zeigt einen Fallback-Text für nicht gecachte Nachrichten', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const message = mockMessage({ partial: true, author: null, content: null });

            await loggingHandler.handleMessageDelete(message as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Unbekannt'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('nicht verfügbar'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));
            const message = mockMessage();

            await expect(loggingHandler.handleMessageDelete(message as any)).resolves.not.toThrow();
        });
    });

    describe('handleMessageUpdate', () => {
        it('ignoriert Updates außerhalb einer Guild', async () => {
            const oldMessage = mockMessage();
            const newMessage = mockMessage({ guild: null });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('ignoriert Bot-Nachrichten', async () => {
            const oldMessage = mockMessage();
            const newMessage = mockMessage({ author: { tag: 'Bot#0000', bot: true }, content: 'geändert' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('ignoriert Updates ohne Inhaltsänderung (z.B. Embed-Unfurling)', async () => {
            const oldMessage = mockMessage({ content: 'Gleicher Text' });
            const newMessage = mockMessage({ content: 'Gleicher Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('loggt eine echte Inhaltsänderung', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const oldMessage = mockMessage({ content: 'Alter Text' });
            const newMessage = mockMessage({ content: 'Neuer Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Alter Text'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neuer Text'));
        });

        it('zeigt einen Fallback-Text wenn die alte Nachricht nicht gecacht war', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const oldMessage = mockMessage({ partial: true, content: null });
            const newMessage = mockMessage({ content: 'Neuer Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('nicht verfügbar'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neuer Text'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));
            const oldMessage = mockMessage({ content: 'Alt' });
            const newMessage = mockMessage({ content: 'Neu' });

            await expect(loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any)).resolves.not.toThrow();
        });
    });
});
