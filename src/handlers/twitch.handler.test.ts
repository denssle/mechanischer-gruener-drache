import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';

vi.mock('../services/twitch.user.service.js', () => ({
    default: {
        getLinkByDiscordId: vi.fn(),
        linkUser: vi.fn(),
        unlinkUser: vi.fn(),
        getDiscordIdByTwitchId: vi.fn(),
        getDiscordIdBySubscriptionId: vi.fn(),
        getNotificationChannel: vi.fn(),
        setNotificationChannel: vi.fn(),
        getNotificationRole: vi.fn(),
        setNotificationRole: vi.fn(),
    }
}));

vi.mock('../services/twitch.service.js', () => ({
    default: {
        getUserByLogin: vi.fn(),
        subscribeToStreamOnline: vi.fn(),
        unsubscribeFromStreamOnline: vi.fn(),
    }
}));

vi.mock('../services/user.service.js', () => ({
    default: {
        getUser: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {
        channels: {
            fetch: vi.fn(),
        }
    }
}));

import twitchUserService from '../services/twitch.user.service.js';
import twitchService from '../services/twitch.service.js';
import userService from '../services/user.service.js';
import client from '../client.js';
import twitchHandler from './twitch.handler.js';

const mockLink = (overrides = {}) => ({
    discordUserId: 'discord-1',
    twitchUserId: 'twitch-1',
    twitchLogin: 'teststreamer',
    twitchDisplayName: 'TestStreamer',
    subscriptionId: 'sub-1',
    linkedAt: new Date().toISOString(),
    ...overrides,
});

describe('TwitchHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleVerknuepfen', () => {
        const mockInteraction = (channel = 'teststreamer') => ({
            user: { id: 'discord-1' },
            options: { getString: vi.fn().mockReturnValue(channel) },
            deferReply: vi.fn(),
            editReply: vi.fn(),
        } as any);

        it('lehnt ab wenn bereits eine Verknüpfung besteht', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(mockLink());
            const interaction = mockInteraction();

            await twitchHandler.handleVerknuepfen(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('TestStreamer'));
            expect(twitchService.getUserByLogin).not.toHaveBeenCalled();
        });

        it('lehnt ab wenn der Twitch-Channel nicht existiert', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(null);
            vi.mocked(twitchService.getUserByLogin).mockResolvedValue(null);
            const interaction = mockInteraction('unbekannt');

            await twitchHandler.handleVerknuepfen(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('nicht gefunden'));
            expect(twitchUserService.linkUser).not.toHaveBeenCalled();
        });

        it('lehnt ab wenn die EventSub-Subscription fehlschlägt', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(null);
            vi.mocked(twitchService.getUserByLogin).mockResolvedValue({
                id: 'twitch-1', login: 'teststreamer', display_name: 'TestStreamer'
            } as any);
            vi.mocked(twitchService.subscribeToStreamOnline).mockResolvedValue(null);
            const interaction = mockInteraction();

            await twitchHandler.handleVerknuepfen(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Fehler'));
            expect(twitchUserService.linkUser).not.toHaveBeenCalled();
        });

        it('verknüpft den User bei Erfolg', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(null);
            vi.mocked(twitchService.getUserByLogin).mockResolvedValue({
                id: 'twitch-1', login: 'teststreamer', display_name: 'TestStreamer'
            } as any);
            vi.mocked(twitchService.subscribeToStreamOnline).mockResolvedValue('sub-1');
            const interaction = mockInteraction();

            await twitchHandler.handleVerknuepfen(interaction);

            expect(twitchUserService.linkUser).toHaveBeenCalledWith(
                'discord-1', 'twitch-1', 'teststreamer', 'TestStreamer', 'sub-1'
            );
            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('erfolgreich verknüpft'));
        });
    });

    describe('handleEntfernen', () => {
        const mockInteraction = () => ({
            user: { id: 'discord-1' },
            deferReply: vi.fn(),
            editReply: vi.fn(),
        } as any);

        it('meldet wenn keine Verknüpfung besteht', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(null);
            const interaction = mockInteraction();

            await twitchHandler.handleEntfernen(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('keinen Twitch-Channel'));
            expect(twitchService.unsubscribeFromStreamOnline).not.toHaveBeenCalled();
        });

        it('entfernt die Verknüpfung und die Subscription bei Erfolg', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(mockLink());
            vi.mocked(twitchService.unsubscribeFromStreamOnline).mockResolvedValue(true);
            const interaction = mockInteraction();

            await twitchHandler.handleEntfernen(interaction);

            expect(twitchService.unsubscribeFromStreamOnline).toHaveBeenCalledWith('sub-1');
            expect(twitchUserService.unlinkUser).toHaveBeenCalledWith('discord-1');
            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('TestStreamer'));
        });

        it('lässt die Verknüpfung bestehen wenn das Entfernen der Subscription fehlschlägt', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(mockLink());
            vi.mocked(twitchService.unsubscribeFromStreamOnline).mockResolvedValue(false);
            const interaction = mockInteraction();

            await twitchHandler.handleEntfernen(interaction);

            expect(twitchUserService.unlinkUser).not.toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Fehler'));
        });
    });

    describe('handleStatus', () => {
        const mockInteraction = () => ({
            user: { id: 'discord-1' },
            reply: vi.fn(),
        } as any);

        it('meldet wenn keine Verknüpfung besteht', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(null);
            const interaction = mockInteraction();

            await twitchHandler.handleStatus(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('keinen Twitch-Kanal'));
        });

        it('zeigt die bestehende Verknüpfung an', async () => {
            vi.mocked(twitchUserService.getLinkByDiscordId).mockResolvedValue(mockLink());
            const interaction = mockInteraction();

            await twitchHandler.handleStatus(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('TestStreamer'));
        });
    });

    describe('handleBenachrichtigungskanal', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getChannel: vi.fn().mockReturnValue({ id: 'channel-1' }) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await twitchHandler.handleBenachrichtigungskanal(interaction);

            expect(twitchUserService.setNotificationChannel).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('setzt den Notification-Channel mit Administrator-Rechten', async () => {
            const interaction = mockInteraction(true);

            await twitchHandler.handleBenachrichtigungskanal(interaction);

            expect(interaction.memberPermissions.has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
            expect(twitchUserService.setNotificationChannel).toHaveBeenCalledWith('channel-1');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('channel-1'));
        });
    });

    describe('handleBenachrichtigungsrolle', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getRole: vi.fn().mockReturnValue({ id: 'role-1' }) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await twitchHandler.handleBenachrichtigungsrolle(interaction);

            expect(twitchUserService.setNotificationRole).not.toHaveBeenCalled();
        });

        it('setzt die Notification-Rolle mit Administrator-Rechten', async () => {
            const interaction = mockInteraction(true);

            await twitchHandler.handleBenachrichtigungsrolle(interaction);

            expect(twitchUserService.setNotificationRole).toHaveBeenCalledWith('role-1');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('role-1'));
        });
    });

    describe('handleSubscriptionRevoked', () => {
        it('tut nichts wenn die Subscription keinem Discord-User zugeordnet ist', async () => {
            vi.mocked(twitchUserService.getDiscordIdBySubscriptionId).mockResolvedValue(null);

            await twitchHandler.handleSubscriptionRevoked('sub-1', 'authorization_revoked');

            expect(twitchUserService.unlinkUser).not.toHaveBeenCalled();
        });

        it('entfernt die Verknüpfung des betroffenen Users', async () => {
            vi.mocked(twitchUserService.getDiscordIdBySubscriptionId).mockResolvedValue('discord-1');

            await twitchHandler.handleSubscriptionRevoked('sub-1', 'authorization_revoked');

            expect(twitchUserService.unlinkUser).toHaveBeenCalledWith('discord-1');
        });
    });

    describe('handleStreamOnline', () => {
        const event = {
            id: 'evt-1',
            broadcaster_user_id: 'twitch-1',
            broadcaster_user_login: 'teststreamer',
            broadcaster_user_name: 'TestStreamer',
            type: 'live',
            started_at: new Date().toISOString(),
        };

        it('bricht ab wenn kein verknüpfter Discord-User gefunden wird', async () => {
            vi.mocked(twitchUserService.getDiscordIdByTwitchId).mockResolvedValue(null);

            await twitchHandler.handleStreamOnline('twitch-1', event);

            expect(twitchUserService.getNotificationChannel).not.toHaveBeenCalled();
            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('bricht ab wenn kein Notification-Channel konfiguriert ist', async () => {
            vi.mocked(twitchUserService.getDiscordIdByTwitchId).mockResolvedValue('discord-1');
            vi.mocked(twitchUserService.getNotificationChannel).mockResolvedValue(null);

            await twitchHandler.handleStreamOnline('twitch-1', event);

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('bricht ab wenn der Channel nicht gefetcht werden kann', async () => {
            vi.mocked(twitchUserService.getDiscordIdByTwitchId).mockResolvedValue('discord-1');
            vi.mocked(twitchUserService.getNotificationChannel).mockResolvedValue('channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue(null as any);

            await expect(twitchHandler.handleStreamOnline('twitch-1', event)).resolves.not.toThrow();

            expect(userService.getUser).not.toHaveBeenCalled();
        });

        it('sendet eine Benachrichtigung mit Rollen-Mention und gespeichertem Displaynamen', async () => {
            const send = vi.fn();
            vi.mocked(twitchUserService.getDiscordIdByTwitchId).mockResolvedValue('discord-1');
            vi.mocked(twitchUserService.getNotificationChannel).mockResolvedValue('channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            vi.mocked(userService.getUser).mockResolvedValue({ displayName: 'GespeicherterName' } as any);
            vi.mocked(twitchUserService.getNotificationRole).mockResolvedValue('role-1');

            await twitchHandler.handleStreamOnline('twitch-1', event);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('GespeicherterName'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('<@&role-1>'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('twitch.tv/teststreamer'));
        });

        it('fällt auf den Twitch-Anzeigenamen zurück, wenn kein User gespeichert ist, und lässt die Rolle weg', async () => {
            const send = vi.fn();
            vi.mocked(twitchUserService.getDiscordIdByTwitchId).mockResolvedValue('discord-1');
            vi.mocked(twitchUserService.getNotificationChannel).mockResolvedValue('channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            vi.mocked(userService.getUser).mockResolvedValue(null);
            vi.mocked(twitchUserService.getNotificationRole).mockResolvedValue(null);

            await twitchHandler.handleStreamOnline('twitch-1', event);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('TestStreamer'));
            expect(send).toHaveBeenCalledWith(expect.not.stringContaining('<@&'));
        });
    });
});
