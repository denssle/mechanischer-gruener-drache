import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import reactionRoleService from './reactionRole.service.js';

describe('ReactionRoleService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('speichert eine Bindung unter message-id und emoji-key', async () => {
        await reactionRoleService.setBinding('msg-1', '✅', 'role-1');

        expect(redisService.set).toHaveBeenCalledWith('REACTIONROLE:msg-1:✅', 'role-1');
    });

    it('liest eine Bindung', async () => {
        vi.mocked(redisService.get).mockResolvedValue('role-1');

        const roleId = await reactionRoleService.getBinding('msg-1', '✅');

        expect(redisService.get).toHaveBeenCalledWith('REACTIONROLE:msg-1:✅');
        expect(roleId).toBe('role-1');
    });

    describe('removeBinding', () => {
        it('gibt false zurück wenn keine Bindung existiert', async () => {
            vi.mocked(redisService.get).mockResolvedValue(null);

            const result = await reactionRoleService.removeBinding('msg-1', '✅');

            expect(result).toBe(false);
            expect(redisService.delete).not.toHaveBeenCalled();
        });

        it('löscht eine bestehende Bindung', async () => {
            vi.mocked(redisService.get).mockResolvedValue('role-1');

            const result = await reactionRoleService.removeBinding('msg-1', '✅');

            expect(result).toBe(true);
            expect(redisService.delete).toHaveBeenCalledWith('REACTIONROLE:msg-1:✅');
        });
    });
});
