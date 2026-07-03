import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config.json', () => ({
    default: { GUILD_ID: 'guild-1' }
}));

vi.mock('../services/user.service.js', () => ({
    default: {
        saveUser: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {
        on: vi.fn(),
        guilds: { cache: new Map() },
    }
}));

import client from '../client.js';
import userService from '../services/user.service.js';
import memberHandler from './member.handler.js';

const mockMember = (id: string) => ({ id, user: { tag: `user-${id}#0000` } } as any);

// client.guilds.cache ist im echten discord.js readonly - im Mock ist es ein
// beschreibbares Feld, daher hier gezielt gecastet statt überall `as any`.
const setGuildsCache = (entries: [string, unknown][]) => {
    (client.guilds as any).cache = new Map(entries);
};

describe('MemberHandler', () => {
    beforeEach(() => {
        // resetAllMocks statt clearAllMocks: löscht auch mockRejectedValue/mockResolvedValue
        // aus vorherigen Tests, nicht nur die Aufruf-Historie.
        vi.resetAllMocks();
    });

    describe('handleGuildMemberUpdate', () => {
        it('speichert den aktualisierten Member', async () => {
            const newMember = mockMember('1');

            await memberHandler.handleGuildMemberUpdate(newMember, newMember);

            expect(userService.saveUser).toHaveBeenCalledWith(newMember);
        });

        it('fängt Fehler beim Speichern ab', async () => {
            vi.mocked(userService.saveUser).mockRejectedValue(new Error('Redis kaputt'));
            const newMember = mockMember('1');

            await expect(memberHandler.handleGuildMemberUpdate(newMember, newMember)).resolves.not.toThrow();
        });
    });

    describe('handleUserUpdate', () => {
        it('lädt den Member aus der konfigurierten Guild und speichert ihn', async () => {
            const member = mockMember('user-42');
            const fetch = vi.fn().mockResolvedValue(member);
            setGuildsCache([['guild-1', { members: { fetch } }]]);

            await memberHandler.handleUserUpdate({} as any, { id: 'user-42' } as any);

            expect(fetch).toHaveBeenCalledWith('user-42');
            expect(userService.saveUser).toHaveBeenCalledWith(member);
        });

        it('tut nichts wenn die konfigurierte Guild nicht im Cache ist', async () => {
            setGuildsCache([]);

            await memberHandler.handleUserUpdate({} as any, { id: 'user-42' } as any);

            expect(userService.saveUser).not.toHaveBeenCalled();
        });

        it('fängt Fehler beim Fetchen ab', async () => {
            const fetch = vi.fn().mockRejectedValue(new Error('Discord API down'));
            setGuildsCache([['guild-1', { members: { fetch } }]]);

            await expect(memberHandler.handleUserUpdate({} as any, { id: 'user-42' } as any)).resolves.not.toThrow();
            expect(userService.saveUser).not.toHaveBeenCalled();
        });
    });

    describe('loadAllMembers', () => {
        it('lädt und speichert alle Member aus allen Guilds', async () => {
            const membersA = new Map([['1', mockMember('1')], ['2', mockMember('2')]]);
            const guildA = { name: 'Guild A', members: { fetch: vi.fn().mockResolvedValue(membersA) } };
            setGuildsCache([['guild-1', guildA]]);

            await memberHandler.loadAllMembers();

            expect(userService.saveUser).toHaveBeenCalledTimes(2);
        });

        it('fängt Fehler beim Laden ab', async () => {
            const guildA = { name: 'Guild A', members: { fetch: vi.fn().mockRejectedValue(new Error('kaputt')) } };
            setGuildsCache([['guild-1', guildA]]);

            await expect(memberHandler.loadAllMembers()).resolves.not.toThrow();
        });

        it('tut nichts wenn der Bot in keiner Guild ist', async () => {
            setGuildsCache([]);

            await memberHandler.loadAllMembers();

            expect(userService.saveUser).not.toHaveBeenCalled();
        });
    });
});
