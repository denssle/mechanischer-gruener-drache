import {describe, it, expect, vi, beforeEach} from 'vitest';

const rollenhinweisService = vi.hoisted(() => ({
    getChannel: vi.fn(),
    getRollenKanal: vi.fn(),
    getWillkommensKanal: vi.fn(),
    markiereHingewiesen: vi.fn(),
    vergiss: vi.fn(),
}));
vi.mock('../services/rollenhinweis.service.js', () => ({default: rollenhinweisService}));

import {Collection} from 'discord.js';
import rollenhinweisHandler, {ROLLENHINWEIS_TEXT, rollenhinweisText, willkommensText} from './rollenhinweis.handler.js';

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
        rollenhinweisService.getRollenKanal.mockResolvedValue(null);
        rollenhinweisService.markiereHingewiesen.mockResolvedValue(true);
    });

    it('antwortet einer Person ohne Rolle im Hinweis-Kanal', async () => {
        const message = mockMessage();

        await rollenhinweisHandler.handleMessage(message);

        expect(rollenhinweisService.markiereHingewiesen).toHaveBeenCalledWith('user-1');
        expect(message.reply).toHaveBeenCalledWith(ROLLENHINWEIS_TEXT);
    });

    it('verlinkt den Kanal mit dem Rollen-Button, wenn er gesetzt ist', async () => {
        rollenhinweisService.getRollenKanal.mockResolvedValue('kanal-rollen');
        const message = mockMessage();

        await rollenhinweisHandler.handleMessage(message);

        expect(message.reply).toHaveBeenCalledWith(rollenhinweisText('kanal-rollen'));
        expect(rollenhinweisText('kanal-rollen')).toContain('Hol dir in <#kanal-rollen> eine Rolle');
    });

    // Ein geänderter Wortlaut ließe replace() sonst still ins Leere laufen.
    it('baut den Link wirklich in den Text ein', () => {
        expect(rollenhinweisText('x')).not.toBe(ROLLENHINWEIS_TEXT);
        expect(rollenhinweisText(null)).toBe(ROLLENHINWEIS_TEXT);
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

    it('nimmt die Markierung auch zurück, wenn der Rollen-Kanal nicht lesbar ist', async () => {
        rollenhinweisService.getRollenKanal.mockRejectedValue(new Error('Redis weg'));
        const message = mockMessage();

        await expect(rollenhinweisHandler.handleMessage(message)).rejects.toThrow('Redis weg');

        expect(rollenhinweisService.vergiss).toHaveBeenCalledWith('user-1');
    });
});

describe('Willkommensgruß', () => {
    const send = vi.fn();
    const fetch = vi.fn();
    const mockMember = (bot = false) => ({id: 'neu-1', user: {bot}, guild: {channels: {fetch}}}) as any;

    beforeEach(() => {
        vi.resetAllMocks();
        rollenhinweisService.getWillkommensKanal.mockResolvedValue('kanal-gruss');
        rollenhinweisService.getRollenKanal.mockResolvedValue(null);
        fetch.mockResolvedValue({isSendable: () => true, send});
    });

    it('begrüßt und pingt genau die neue Person', async () => {
        rollenhinweisService.getRollenKanal.mockResolvedValue('kanal-rollen');

        await rollenhinweisHandler.handleBeitritt(mockMember());

        expect(fetch).toHaveBeenCalledWith('kanal-gruss');
        expect(send).toHaveBeenCalledWith({
            content: willkommensText('neu-1', 'kanal-rollen'),
            allowedMentions: {users: ['neu-1']},
        });
    });

    it('verlinkt den Rollen-Kanal nur, wenn er gesetzt ist', () => {
        expect(willkommensText('neu-1', 'kanal-rollen')).toContain('Hol dir in <#kanal-rollen> eine Rolle');
        expect(willkommensText('neu-1', null)).toContain('Hol dir eine Rolle');
    });

    it('begrüßt keine Bots', async () => {
        await rollenhinweisHandler.handleBeitritt(mockMember(true));

        expect(send).not.toHaveBeenCalled();
    });

    it('bleibt ohne Kanal still', async () => {
        rollenhinweisService.getWillkommensKanal.mockResolvedValue(null);

        await rollenhinweisHandler.handleBeitritt(mockMember());

        expect(fetch).not.toHaveBeenCalled();
    });

    it('überspringt Kanäle, in die man nicht schreiben kann', async () => {
        fetch.mockResolvedValue({isSendable: () => false, send});

        await rollenhinweisHandler.handleBeitritt(mockMember());

        expect(send).not.toHaveBeenCalled();
    });

    it('vermerkt niemanden als hingewiesen, die Antwort im Hinweis-Kanal bleibt möglich', async () => {
        await rollenhinweisHandler.handleBeitritt(mockMember());

        expect(rollenhinweisService.markiereHingewiesen).not.toHaveBeenCalled();
    });
});
