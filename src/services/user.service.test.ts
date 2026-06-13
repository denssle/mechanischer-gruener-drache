import { describe, it, expect, vi, beforeEach } from 'vitest';

// Redis mocken bevor der Service importiert wird
vi.mock('../services/redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
    }
}));

import redisService from '../services/redis.service.js';
import userService from './user.service.js';

describe('UserService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('gibt null zurück wenn User nicht existiert', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        const user = await userService.getUser('nicht-vorhanden');
        expect(user).toBeNull();
    });

    it('gibt gespeicherten User zurück', async () => {
        const storedUser = { id: '123', username: 'Testuser' };
        vi.mocked(redisService.get).mockResolvedValue(JSON.stringify(storedUser));

        const user = await userService.getUser('123');
        expect(user).toEqual(storedUser);
    });
});