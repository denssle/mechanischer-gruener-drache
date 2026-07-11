import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Collection, PermissionFlagsBits } from 'discord.js';

vi.mock('../services/logging.service.js', () => ({
    default: {
        setLogChannel: vi.fn(),
        getLogChannel: vi.fn(),
        cacheMessage: vi.fn(),
        getCachedMessage: vi.fn(),
        deleteCachedMessage: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {
        on: vi.fn(),
        channels: { fetch: vi.fn() },
    }
}));

import loggingService from '../services/logging.service.js';
import client from '../client.js';
import loggingHandler from './logging.handler.js';

const mockMessage = (overrides = {}) => ({
    id: 'message-1',
    guild: { id: 'guild-1' },
    author: { tag: 'User#0001', bot: false },
    partial: false,
    content: 'Hallo Welt',
    channelId: 'source-channel',
    attachments: new Collection<string, { name: string }>(),
    ...overrides,
});

describe('LoggingHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('handleSetChannel', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getChannel: vi.fn().mockReturnValue({ id: 'log-channel-1' }) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await loggingHandler.handleSetChannel(interaction);

            expect(loggingService.setLogChannel).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('setzt den Log-Channel mit Administrator-Rechten', async () => {
            const interaction = mockInteraction(true);

            await loggingHandler.handleSetChannel(interaction);

            expect(interaction.memberPermissions.has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
            expect(loggingService.setLogChannel).toHaveBeenCalledWith('log-channel-1');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('log-channel-1'));
        });
    });

    describe('handleMessageCreate (Nachrichten-Cache)', () => {
        const attachments = new Collection<string, { name: string }>([['a1', { name: 'bild.png' }]]);

        it('merkt sich Inhalt und Anhang-Namen, wenn ein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            const message = mockMessage({ content: 'Hallo Welt', attachments });

            await loggingHandler.handleMessageCreate(message as any);

            expect(loggingService.cacheMessage).toHaveBeenCalledWith('message-1', {
                authorTag: 'User#0001',
                content: 'Hallo Welt',
                attachments: ['bild.png'],
            });
        });

        it('speichert nichts, wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);

            await loggingHandler.handleMessageCreate(mockMessage() as any);

            expect(loggingService.cacheMessage).not.toHaveBeenCalled();
        });

        it('speichert weder Bot- noch DM-Nachrichten', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');

            await loggingHandler.handleMessageCreate(mockMessage({ author: { tag: 'Bot#0000', bot: true } }) as any);
            await loggingHandler.handleMessageCreate(mockMessage({ guild: null }) as any);

            expect(loggingService.cacheMessage).not.toHaveBeenCalled();
        });

        it('fängt Fehler ab, statt den MessageCreate-Pfad zu killen', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleMessageCreate(mockMessage() as any)).resolves.not.toThrow();
        });
    });

    describe('handleMessageDelete', () => {
        it('ignoriert Nachrichten außerhalb einer Guild (DMs)', async () => {
            const message = mockMessage({ guild: null });

            await loggingHandler.handleMessageDelete(message as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('ignoriert Bot-Nachrichten', async () => {
            const message = mockMessage({ author: { tag: 'Bot#0000', bot: true } });

            await loggingHandler.handleMessageDelete(message as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);
            const message = mockMessage();

            await loggingHandler.handleMessageDelete(message as any);

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt die gelöschte Nachricht mit Inhalt', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const message = mockMessage({ content: 'Geheime Nachricht' });

            await loggingHandler.handleMessageDelete(message as any);

            expect(client.channels.fetch).toHaveBeenCalledWith('log-channel-1');
            expect(send).toHaveBeenCalledWith(expect.stringContaining('User#0001'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Geheime Nachricht'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('<#source-channel>'));
        });

        it('zeigt einen Fallback-Text für nicht gecachte Nachrichten', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const message = mockMessage({ partial: true, author: null, content: null });

            await loggingHandler.handleMessageDelete(message as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Unbekannt'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('nicht verfügbar'));
        });

        it('holt den alten Inhalt aus dem Redis-Cache, wenn discord.js die Nachricht nicht mehr kennt', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            vi.mocked(loggingService.getCachedMessage).mockResolvedValue({
                authorTag: 'User#0001', content: 'Alte Nachricht', attachments: ['bild.png'],
            });
            const message = mockMessage({ partial: true, author: null, content: null });

            await loggingHandler.handleMessageDelete(message as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Alte Nachricht'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Anhänge: bild.png'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('User#0001'));
        });

        it('räumt den zwischengespeicherten Inhalt nach dem Loggen weg', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send: vi.fn() } as any);

            await loggingHandler.handleMessageDelete(mockMessage() as any);

            expect(loggingService.deleteCachedMessage).toHaveBeenCalledWith('message-1');
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));
            const message = mockMessage();

            await expect(loggingHandler.handleMessageDelete(message as any)).resolves.not.toThrow();
        });
    });

    describe('handleMessageUpdate', () => {
        it('ignoriert Updates außerhalb einer Guild', async () => {
            const oldMessage = mockMessage();
            const newMessage = mockMessage({ guild: null });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('ignoriert Bot-Nachrichten', async () => {
            const oldMessage = mockMessage();
            const newMessage = mockMessage({ author: { tag: 'Bot#0000', bot: true }, content: 'geändert' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('ignoriert Updates ohne Inhaltsänderung (z.B. Embed-Unfurling)', async () => {
            const oldMessage = mockMessage({ content: 'Gleicher Text' });
            const newMessage = mockMessage({ content: 'Gleicher Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('loggt eine echte Inhaltsänderung', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const oldMessage = mockMessage({ content: 'Alter Text' });
            const newMessage = mockMessage({ content: 'Neuer Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Alter Text'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neuer Text'));
        });

        it('zeigt einen Fallback-Text wenn die alte Nachricht nicht gecacht war', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const oldMessage = mockMessage({ partial: true, content: null });
            const newMessage = mockMessage({ content: 'Neuer Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('nicht verfügbar'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neuer Text'));
        });

        it('holt den alten Inhalt aus dem Redis-Cache und schreibt den neuen Stand zurück', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            vi.mocked(loggingService.getCachedMessage).mockResolvedValue({
                authorTag: 'User#0001', content: 'Alter Text', attachments: [],
            });
            const oldMessage = mockMessage({ partial: true, content: null });
            const newMessage = mockMessage({ content: 'Neuer Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Vorher: Alter Text'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Nachher: Neuer Text'));
            // Für die nächste Bearbeitung ist der neue Stand der alte.
            expect(loggingService.cacheMessage).toHaveBeenCalledWith('message-1', {
                authorTag: 'User#0001', content: 'Neuer Text', attachments: [],
            });
        });

        it('ignoriert ein Update ohne Änderung auch dann, wenn der alte Stand nur im Redis-Cache liegt', async () => {
            vi.mocked(loggingService.getCachedMessage).mockResolvedValue({
                authorTag: 'User#0001', content: 'Gleicher Text', attachments: [],
            });
            const oldMessage = mockMessage({ partial: true, content: null });
            const newMessage = mockMessage({ content: 'Gleicher Text' });

            await loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));
            const oldMessage = mockMessage({ content: 'Alt' });
            const newMessage = mockMessage({ content: 'Neu' });

            await expect(loggingHandler.handleMessageUpdate(oldMessage as any, newMessage as any)).resolves.not.toThrow();
        });
    });

    describe('handleGuildMemberAdd', () => {
        const mockMember = () => ({ user: { tag: 'Neuling#0001' } } as any);

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);

            await loggingHandler.handleGuildMemberAdd(mockMember());

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt den Server-Beitritt', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberAdd(mockMember());

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neuling#0001'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('beigetreten'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleGuildMemberAdd(mockMember())).resolves.not.toThrow();
        });
    });

    describe('handleGuildMemberRemove', () => {
        const mockMember = () => ({ user: { tag: 'Ex-User#0002' } } as any);

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);

            await loggingHandler.handleGuildMemberRemove(mockMember());

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt den Server-Austritt', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberRemove(mockMember());

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Ex-User#0002'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('verlassen'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleGuildMemberRemove(mockMember())).resolves.not.toThrow();
        });
    });

    describe('handleGuildMemberUpdate', () => {
        const roleCache = (roles: { id: string; name: string }[]) => {
            const cache = new Collection<string, { id: string; name: string }>();
            for (const role of roles) cache.set(role.id, role);
            return cache;
        };
        const mockMember = (roles: { id: string; name: string }[], overrides = {}) => ({
            partial: false,
            user: { tag: 'User#0001' },
            roles: { cache: roleCache(roles) },
            ...overrides,
        } as any);

        it('überspringt nicht gecachte (partial) alte Mitglieder', async () => {
            const oldMember = mockMember([], { partial: true });
            const newMember = mockMember([{ id: 'r1', name: 'Einwohner' }]);

            await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('tut nichts wenn sich die Rollen nicht geändert haben', async () => {
            const roles = [{ id: 'r1', name: 'Einwohner' }];

            await loggingHandler.handleGuildMemberUpdate(mockMember(roles), mockMember(roles));

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);
            const oldMember = mockMember([]);
            const newMember = mockMember([{ id: 'r1', name: 'Einwohner' }]);

            await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt eine erhaltene Rolle', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const oldMember = mockMember([{ id: 'r1', name: 'Basis' }]);
            const newMember = mockMember([{ id: 'r1', name: 'Basis' }, { id: 'r2', name: 'Einwohner' }]);

            await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

            expect(send).toHaveBeenCalledTimes(1);
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Einwohner'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('erhalten'));
        });

        it('loggt eine verlorene Rolle', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            const oldMember = mockMember([{ id: 'r1', name: 'Basis' }, { id: 'r2', name: 'Twitch' }]);
            const newMember = mockMember([{ id: 'r1', name: 'Basis' }]);

            await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

            expect(send).toHaveBeenCalledTimes(1);
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Twitch'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('verloren'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));
            const oldMember = mockMember([]);
            const newMember = mockMember([{ id: 'r1', name: 'Einwohner' }]);

            await expect(loggingHandler.handleGuildMemberUpdate(oldMember, newMember)).resolves.not.toThrow();
        });

        it('loggt eine Nickname-Änderung', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberUpdate(
                mockMember([], { nickname: 'Alt' }),
                mockMember([], { nickname: 'Neu' })
            );

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Alt'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neu'));
        });

        it('loggt einen gesetzten Timeout', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberUpdate(
                mockMember([], { communicationDisabledUntilTimestamp: null }),
                mockMember([], { communicationDisabledUntilTimestamp: Date.now() + 600000 })
            );

            expect(send).toHaveBeenCalledWith(expect.stringContaining('stummgeschaltet'));
        });

        it('loggt einen aufgehobenen Timeout', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberUpdate(
                mockMember([], { communicationDisabledUntilTimestamp: Date.now() + 600000 }),
                mockMember([], { communicationDisabledUntilTimestamp: null })
            );

            expect(send).toHaveBeenCalledWith(expect.stringContaining('aufgehoben'));
        });
    });

    describe('handleGuildBanAdd', () => {
        const mockBan = (overrides = {}) => ({ user: { tag: 'Böser#0001' }, reason: null, ...overrides } as any);

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);

            await loggingHandler.handleGuildBanAdd(mockBan());

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt den Bann inklusive Grund', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildBanAdd(mockBan({ reason: 'Spam' }));

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Böser#0001'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('gebannt'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('Spam'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleGuildBanAdd(mockBan())).resolves.not.toThrow();
        });
    });

    describe('handleGuildBanRemove', () => {
        const mockBan = () => ({ user: { tag: 'Böser#0001' } } as any);

        it('loggt die Bann-Aufhebung', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildBanRemove(mockBan());

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Böser#0001'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('aufgehoben'));
        });
    });

    describe('handleMessageBulkDelete', () => {
        const mockMessages = (count: number) => {
            const c = new Collection<string, any>();
            for (let i = 0; i < count; i++) c.set(String(i), {});
            return c;
        };

        it('tut nichts wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);

            await loggingHandler.handleMessageBulkDelete(mockMessages(3), { id: 'src-channel' } as any);

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt Anzahl und Channel der Massen-Löschung', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleMessageBulkDelete(mockMessages(3), { id: 'src-channel' } as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('3'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('<#src-channel>'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleMessageBulkDelete(mockMessages(1), { id: 'src-channel' } as any)).resolves.not.toThrow();
        });
    });
});
