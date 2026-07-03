import redisService from './redis.service.js';

const KEYS = {
    binding: (messageId: string, emojiKey: string) => `REACTIONROLE:${messageId}:${emojiKey}`,
};

class ReactionRoleService {
    async setBinding(messageId: string, emojiKey: string, roleId: string): Promise<void> {
        await redisService.set(KEYS.binding(messageId, emojiKey), roleId);
    }

    async getBinding(messageId: string, emojiKey: string): Promise<string | null> {
        return redisService.get(KEYS.binding(messageId, emojiKey));
    }

    async removeBinding(messageId: string, emojiKey: string): Promise<boolean> {
        const existing = await this.getBinding(messageId, emojiKey);
        if (!existing) return false;

        await redisService.delete(KEYS.binding(messageId, emojiKey));
        return true;
    }
}

export default new ReactionRoleService();
