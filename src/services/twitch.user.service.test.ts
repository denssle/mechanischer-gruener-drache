import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        addToList: vi.fn(),
        removeFromList: vi.fn(),
        getList: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import twitchUserService from './twitch.user.service.js';

const mockLink = (overrides = {}) => ({
    discordUserId: 'discord-1',
    twitchUserId: 'twitch-1',
    twitchLogin: 'teststreamer',
    twitchDisplayName: 'TestStreamer',
    subscriptionId: 'sub-1',
    linkedAt: new Date().toISOString(),
    ...overrides,
});

describe('TwitchUserService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('linkUser', () => {
        it('speichert Link, Mapping und Subscription in Redis', async () => {
            const link = await twitchUserService.linkUser('discord-1', 'twitch-1', 'teststreamer', 'TestStreamer', 'sub-1');

            expect(redisService.set).toHaveBeenCalledWith('TWITCH:USER:discord-1', expect.stringContaining('teststreamer'));
            expect(redisService.set).toHaveBeenCalledWith('TWITCH:MAPPING:twitch-1', 'discord-1');
            expect(redisService.set).toHaveBeenCalledWith('TWITCH:SUBSCRIPTION:sub-1', 'discord-1');
            expect(redisService.addToList).toHaveBeenCalledWith('TWITCH:ALL_LINKS', 'discord-1');
            expect(link.discordUserId).toBe('discord-1');
        });
    });

    describe('unlinkUser', () => {
        it('gibt false zurück wenn kein Link existiert', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            const result = await twitchUserService.unlinkUser('discord-1');

            expect(result).toBe(false);
            expect(redisService.delete).not.toHaveBeenCalled();
        });

        it('löscht alle zugehörigen Redis-Keys wenn ein Link existiert', async () => {
            vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(mockLink()));

            const result = await twitchUserService.unlinkUser('discord-1');

            expect(result).toBe(true);
            expect(redisService.delete).toHaveBeenCalledWith('TWITCH:USER:discord-1');
            expect(redisService.delete).toHaveBeenCalledWith('TWITCH:MAPPING:twitch-1');
            expect(redisService.delete).toHaveBeenCalledWith('TWITCH:SUBSCRIPTION:sub-1');
            expect(redisService.removeFromList).toHaveBeenCalledWith('TWITCH:ALL_LINKS', 'discord-1');
        });
    });

    describe('getLinkByDiscordId', () => {
        it('gibt null zurück wenn kein Link existiert', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            const link = await twitchUserService.getLinkByDiscordId('discord-1');

            expect(link).toBeNull();
        });

        it('gibt den geparsten Link zurück', async () => {
            vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(mockLink()));

            const link = await twitchUserService.getLinkByDiscordId('discord-1');

            expect(link?.twitchDisplayName).toBe('TestStreamer');
        });
    });

    describe('getDiscordIdByTwitchId / getDiscordIdBySubscriptionId', () => {
        it('liest die Discord-ID über das Twitch-Mapping', async () => {
            vi.mocked(redisService.get).mockResolvedValue('discord-1');

            const discordId = await twitchUserService.getDiscordIdByTwitchId('twitch-1');

            expect(redisService.get).toHaveBeenCalledWith('TWITCH:MAPPING:twitch-1');
            expect(discordId).toBe('discord-1');
        });

        it('liest die Discord-ID über die Subscription-ID', async () => {
            vi.mocked(redisService.get).mockResolvedValue('discord-1');

            const discordId = await twitchUserService.getDiscordIdBySubscriptionId('sub-1');

            expect(redisService.get).toHaveBeenCalledWith('TWITCH:SUBSCRIPTION:sub-1');
            expect(discordId).toBe('discord-1');
        });
    });

    describe('getAllLinks', () => {
        it('gibt eine leere Liste zurück wenn keine Links existieren', async () => {
            vi.mocked(redisService.getList).mockResolvedValue([]);

            const links = await twitchUserService.getAllLinks();

            expect(links).toEqual([]);
        });

        it('lädt und filtert alle Links, überspringt fehlende', async () => {
            vi.mocked(redisService.getList).mockResolvedValue(['discord-1', 'discord-2']);
            vi.mocked(redisService.get)
                .mockResolvedValueOnce(JSON.stringify(mockLink()))
                .mockResolvedValueOnce(null);

            const links = await twitchUserService.getAllLinks();

            expect(links).toHaveLength(1);
            expect(links[0].discordUserId).toBe('discord-1');
        });
    });

    describe('Notification-Channel und -Rolle', () => {
        it('speichert und liest den Notification-Channel', async () => {
            await twitchUserService.setNotificationChannel('channel-1');
            expect(redisService.set).toHaveBeenCalledWith('TWITCH:NOTIFICATION_CHANNEL', 'channel-1');

            vi.mocked(redisService.get).mockResolvedValue('channel-1');
            const channelId = await twitchUserService.getNotificationChannel();
            expect(channelId).toBe('channel-1');
        });

        it('speichert und liest die Notification-Rolle', async () => {
            await twitchUserService.setNotificationRole('role-1');
            expect(redisService.set).toHaveBeenCalledWith('TWITCH:NOTIFICATION_ROLE', 'role-1');

            vi.mocked(redisService.get).mockResolvedValue('role-1');
            const roleId = await twitchUserService.getNotificationRole();
            expect(roleId).toBe('role-1');
        });
    });
});
