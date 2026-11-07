import {describe, it, expect, vi, beforeEach} from 'vitest';

const rollenhinweisService = vi.hoisted(() => ({
    getChannel: vi.fn(),
    markiereHingewiesen: vi.fn(),
    vergiss: vi.fn(),
}));
vi.mock('../services/rollenhinweis.service.js', () => ({default: rollenhinweisService}));

import {Collection} from 'discord.js';
import rollenhinweisHandler, {ROLLENHINWEIS_TEXT} from './rollenhinweis.handler.js';

const GUILD_ID = 'guild-1';
const KANAL_ID = 'kanal-hinweis';

// Rollen-Cache wie bei discord.js: @everyone (ID = Guild-ID) ist IMMER drin.
const mockMessage = ({
    rollen = [] as string[],
    channelId = KANAL_ID,
    bot = false,
    system = false,
    member = true,
} = {}) => ({
    author: {id: 'user-1', bot},
    system,
    channelId,
    guild: {id: GUILD_ID},
    member: member
        ? {roles: {cache: new Collection([GUILD_ID, ...rollen].map(id => [id, {id}]))}}
        : null,
    reply: vi.fn(),
} as any);

describe('RollenhinweisHandler.handleMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rollenhinweisService.getChannel.mockResolvedValue(KANAL_ID);
        rollenhinweisService.markiereHingewiesen.mockResolvedValue(true);
    });

    it('antwortet einer Person ohne Rolle im Hinweis-Kanal', async () => {
        const message = mockMessage();

        await rollenhinweisHandler.handleMessage(message);

        expect(rollenhinweisService.markiereHingewiesen).toHaveBeenCalledWith('user-1');
        expect(message.reply).toHaveBeenCalledWith(ROLLENHINWEIS_TEXT);
    });

    it('ignoriert Personen mit mindestens einer echten Rolle (@everyone zählt nicht)', async () => {
        const message = mockMessage({rollen: ['einwohner']});

        await rollenhinweisHandler.handleMessage(message);

        expect(rollenhinweisService.markiereHingewiesen).not.toHaveBeenCalled();
        expect(message.reply).not.toHaveBeenCalled();
    });

    it('antwortet nur einmal pro Person', async () => {
        rollenhinweisService.markiereHingewiesen.mockResolvedValue(false);
        const message = mockMessage();

        await rollenhinweisHandler.handleMessage(message);

        expect(message.reply).not.toHaveBeenCalled();
    });

    it('ignoriert andere Kanäle', async () => {
        const message = mockMessage({channelId: 'anderer-kanal'});

        await rollenhinweisHandler.handleMessage(message);

        expect(message.reply).not.toHaveBeenCalled();
    });

    it('tut nichts, solange kein Kanal gesetzt ist', async () => {
        rollenhinweisService.getChannel.mockResolvedValue(null);
        const message = mockMessage();

        await rollenhinweisHandler.handleMessage(message);

        expect(message.reply).not.toHaveBeenCalled();
    });

    it.each([
        ['Bot-Nachrichten', {bot: true}],
        ['Systemnachrichten', {system: true}],
        ['Nachrichten ohne Mitgliedsdaten', {member: false}],
    ])('ignoriert %s', async (_name, optionen) => {
        const message = mockMessage(optionen);

        await rollenhinweisHandler.handleMessage(message);

        expect(rollenhinweisService.getChannel).not.toHaveBeenCalled();
        expect(message.reply).not.toHaveBeenCalled();
    });

    // Sonst wäre die Person für immer vermerkt, ohne den Hinweis je gesehen zu haben.
    it('nimmt die Markierung zurück, wenn die Antwort scheitert', async () => {
        const message = mockMessage();
        message.reply.mockRejectedValue(new Error('Missing Permissions'));

        await expect(rollenhinweisHandler.handleMessage(message)).rejects.toThrow('Missing Permissions');

        expect(rollenhinweisService.vergiss).toHaveBeenCalledWith('user-1');
    });
});
