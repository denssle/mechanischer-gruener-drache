import redisService from './redis.service.js';
import {TwitchUserLink} from "../types/twitchUserLink.js";


const KEYS = {
    userLink: (discordUserId: string) => `TWITCH:USER:${discordUserId}`,
    subscription: (subscriptionId: string) => `TWITCH:SUBSCRIPTION:${subscriptionId}`,
    twitchToDiscord: (twitchUserId: string) => `TWITCH:MAPPING:${twitchUserId}`,
    notificationChannel: 'TWITCH:NOTIFICATION_CHANNEL',
    allLinks: 'TWITCH:ALL_LINKS',
};

class TwitchUserService {

    async linkUser(
        discordUserId: string,
        twitchUserId: string,
        twitchLogin: string,
        twitchDisplayName: string,
        subscriptionId: string
    ): Promise<TwitchUserLink> {
        const link: TwitchUserLink = {
            discordUserId,
            twitchUserId,
            twitchLogin,
            twitchDisplayName,
            subscriptionId,
            linkedAt: new Date().toISOString(),
        };

        await redisService.set(KEYS.userLink(discordUserId), JSON.stringify(link));
        await redisService.set(KEYS.twitchToDiscord(twitchUserId), discordUserId);
        await redisService.set(KEYS.subscription(subscriptionId), discordUserId);
        await redisService.addToList(KEYS.allLinks, discordUserId);

        return link;
    }

    async unlinkUser(discordUserId: string): Promise<boolean> {
        const link = await this.getLinkByDiscordId(discordUserId);
        if (!link) return false;

        await redisService.delete(KEYS.userLink(discordUserId));
        await redisService.delete(KEYS.twitchToDiscord(link.twitchUserId));
        await redisService.delete(KEYS.subscription(link.subscriptionId));
        await redisService.removeFromList(KEYS.allLinks, discordUserId);

        return true;
    }

    async getLinkByDiscordId(discordUserId: string): Promise<TwitchUserLink | null> {
        const data = await redisService.get(KEYS.userLink(discordUserId));
        if (!data) return null;
        return JSON.parse(data) as TwitchUserLink;
    }

    async getDiscordIdByTwitchId(twitchUserId: string): Promise<string | null> {
        return redisService.get(KEYS.twitchToDiscord(twitchUserId));
    }

    async getAllLinks(): Promise<TwitchUserLink[]> {
        const discordUserIds = await redisService.getList(KEYS.allLinks);
        if (!discordUserIds?.length) return [];

        const links = await Promise.all(
            discordUserIds.map(id => this.getLinkByDiscordId(id))
        );

        return links.filter((link): link is TwitchUserLink => link !== null);
    }

    async setNotificationChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.notificationChannel, channelId);
    }

    async getNotificationChannel(): Promise<string | null> {
        return redisService.get(KEYS.notificationChannel);
    }

    async setNotificationRole(roleId: string): Promise<void> {
        await redisService.set('TWITCH:NOTIFICATION_ROLE', roleId);
    }

    async getNotificationRole(): Promise<string | null> {
        return redisService.get('TWITCH:NOTIFICATION_ROLE');
    }
}

export default new TwitchUserService();
