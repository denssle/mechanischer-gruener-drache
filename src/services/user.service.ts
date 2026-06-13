import redisService from "./redis.service.js";
import {GuildMember} from "discord.js";
import {StoredUser} from "../interfaces/StoredUser.js";


class UserService {
    async saveUser(user: GuildMember) {
        const storedUser: StoredUser = {
            id: user.id,
            username: user.user.username,
            tag: user.user.tag,
            displayName: user.displayName,
            roles: user.roles.cache.map(role => role.id),
            joinedAt: user.joinedAt?.toISOString() ?? null,
            saved: Date.now(),
        };
        return redisService.set(user.id, JSON.stringify(storedUser));
    }

    async getUser(userId: string): Promise<StoredUser | null> {
        const userString = await redisService.get(userId);
        if (!userString) return null;
        return JSON.parse(userString) as StoredUser;
    }
}

export default new UserService();