import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogEvent, Collection, PermissionFlagsBits } from 'discord.js';

vi.mock('../services/logging.service.js', () => ({
    default: {
        setLogChannel: vi.fn(),
        getLogChannel: vi.fn(),
        cacheMessage: vi.fn(),
        getCachedMessage: vi.fn(),
        deleteCachedMessage: vi.fn(),
    }
}));

vi.mock('../services/member.service.js', () => ({
    default: {
        zaehleBeitritt: vi.fn(),
        getBeitrittsAnzahl: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {
        on: vi.fn(),
        channels: { fetch: vi.fn() },
    }
}));

import memberService from '../services/member.service.js';
import loggingService from '../services/logging.service.js';
import client from '../client.js';
import loggingHandler, { alsZitat, kuerzeFuerDiscord, DISCORD_MAX_LENGTH, formatMitgliedsdauer, formatAusfuehrer, formatRechteAenderung, beschreibeAuditEintrag } from './logging.handler.js';

// Baut eine Guild, deren Audit-Log die übergebenen Einträge kennt. Ohne Einträge verhält sie
// sich wie ein Server, auf dem gerade nichts protokolliert wurde.
function mockGuild(eintraege: { action: AuditLogEvent; targetId: string; executorTag?: string; reason?: string | null; alter?: number }[] = []) {
    return {
        fetchAuditLogs: vi.fn(async ({ type }: { type: AuditLogEvent }) => ({
            entries: eintraege
                .filter(eintrag => eintrag.action === type)
                .map(eintrag => ({
                    targetId: eintrag.targetId,
                    createdTimestamp: Date.now() - (eintrag.alter ?? 0),
                    executor: eintrag.executorTag ? { tag: eintrag.executorTag } : null,
                    reason: eintrag.reason ?? null,
                })),
        })),
    } as any;
}

describe('formatAusfuehrer', () => {
    it('bleibt leer, wenn es keinen Audit-Eintrag gibt', () => {
        expect(formatAusfuehrer(null)).toBe('');
    });

    it('nennt Urheber und Grund', () => {
        expect(formatAusfuehrer({ ausfuehrerTag: 'Mod#1', grund: 'Spam' })).toBe(' durch **Mod#1** (Grund: Spam)');
    });

    it('lässt weg, was unbekannt ist', () => {
        expect(formatAusfuehrer({ ausfuehrerTag: 'Mod#1', grund: null })).toBe(' durch **Mod#1**');
        expect(formatAusfuehrer({ ausfuehrerTag: null, grund: 'Spam' })).toBe(' (Grund: Spam)');
    });
});

describe('formatRechteAenderung', () => {
    const ADMIN = String(PermissionFlagsBits.Administrator);
    const KICK = String(PermissionFlagsBits.KickMembers);

    it('erkennt hinzugefügte Rechte', () => {
        expect(formatRechteAenderung('0', ADMIN)).toBe('**+** Administrator');
    });

    it('erkennt entzogene Rechte', () => {
        expect(formatRechteAenderung(ADMIN, '0')).toBe('**−** Administrator');
    });

    it('zeigt beide Richtungen zusammen', () => {
        const beides = formatRechteAenderung(ADMIN, KICK);
        expect(beides).toContain('**+** KickMembers');
        expect(beides).toContain('**−** Administrator');
    });

    it('gibt null zurück, wenn sich nichts geändert hat oder Werte fehlen', () => {
        expect(formatRechteAenderung(ADMIN, ADMIN)).toBeNull();
        expect(formatRechteAenderung(null, ADMIN)).toBeNull();
    });
});

describe('beschreibeAuditEintrag', () => {
    const eintrag = (action: AuditLogEvent, extra: Record<string, unknown> = {}) => ({
        action,
        executor: { tag: 'Admin#1' },
        reason: null,
        changes: [],
        target: { name: 'Moderator' },
        ...extra,
    } as any);

    it('meldet erstellte und gelöschte Rollen mit Urheber', () => {
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.RoleCreate)))
            .toBe('➕ Rolle **Moderator** wurde erstellt durch **Admin#1**.');
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.RoleDelete)))
            .toContain('🗑️ Rolle **Moderator** wurde gelöscht');
    });

    it('nennt bei Rechte-Änderungen, welches Recht dazukam', () => {
        const meldung = beschreibeAuditEintrag(eintrag(AuditLogEvent.RoleUpdate, {
            changes: [{ key: 'permissions', old: '0', new: String(PermissionFlagsBits.Administrator) }],
        }));

        expect(meldung).toContain('🔐 Rechte der Rolle **Moderator**');
        expect(meldung).toContain('**+** Administrator');
    });

    it('meldet Umbenennungen', () => {
        const meldung = beschreibeAuditEintrag(eintrag(AuditLogEvent.RoleUpdate, {
            changes: [{ key: 'name', old: 'Alt', new: 'Neu' }],
        }));

        expect(meldung).toContain('**Alt** wurde in **Neu** umbenannt');
    });

    it('schweigt bei belanglosen Rollen-Änderungen wie der Farbe', () => {
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.RoleUpdate, {
            changes: [{ key: 'color', old: 1, new: 2 }],
        }))).toBeNull();
    });

    it('meldet Kanäle und Webhooks', () => {
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.ChannelDelete, { target: { name: 'allgemein' } })))
            .toContain('Kanal **allgemein** wurde gelöscht');
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.WebhookCreate, { target: null, changes: [{ key: 'name', new: 'Hook' }] })))
            .toContain('Webhook **Hook** wurde erstellt');
    });

    it('ignoriert alles außerhalb der Whitelist', () => {
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.MessageDelete))).toBeNull();
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.MemberBanAdd))).toBeNull();
    });

    it('nennt den Grund, wenn einer angegeben wurde', () => {
        expect(beschreibeAuditEintrag(eintrag(AuditLogEvent.RoleDelete, { reason: 'Aufräumen' })))
            .toContain('(Grund: Aufräumen)');
    });
});

describe('formatMitgliedsdauer', () => {
    const TAG = 86400000;

    it('nennt angefangene Tage nicht als Dauer', () => {
        expect(formatMitgliedsdauer(0)).toBe('weniger als einen Tag');
        expect(formatMitgliedsdauer(TAG - 1)).toBe('weniger als einen Tag');
    });

    it('formatiert Tage mit korrektem Singular/Plural', () => {
        expect(formatMitgliedsdauer(TAG)).toBe('1 Tag');
        expect(formatMitgliedsdauer(5 * TAG)).toBe('5 Tage');
    });

    it('kombiniert Monate und Tage', () => {
        expect(formatMitgliedsdauer(30 * TAG)).toBe('1 Monat');
        expect(formatMitgliedsdauer(65 * TAG)).toBe('2 Monate und 5 Tage');
    });

    it('lässt bei Jahren die Tage weg', () => {
        expect(formatMitgliedsdauer(365 * TAG)).toBe('1 Jahr');
        expect(formatMitgliedsdauer((2 * 365 + 65) * TAG)).toBe('2 Jahre und 2 Monate');
    });
});

describe('kuerzeFuerDiscord', () => {
    it('lässt Text bis zum Discord-Limit unverändert', () => {
        expect(kuerzeFuerDiscord('kurz')).toBe('kurz');
        const genauAmLimit = 'a'.repeat(DISCORD_MAX_LENGTH);
        expect(kuerzeFuerDiscord(genauAmLimit)).toBe(genauAmLimit);
    });

    it('kürzt zu langen Text auf das Limit und markiert die Kürzung', () => {
        const zuLang = 'a'.repeat(DISCORD_MAX_LENGTH + 500);
        const result = kuerzeFuerDiscord(zuLang);
        expect(result.length).toBe(DISCORD_MAX_LENGTH);
        expect(result.endsWith('… [gekürzt]')).toBe(true);
    });
});

describe('alsZitat', () => {
    it('setzt ein Zitat-Präfix vor eine einzelne Zeile', () => {
        expect(alsZitat('Hallo Welt')).toBe('> Hallo Welt');
    });

    it('setzt es vor JEDE Zeile - genau dafür ist es da (mehrzeilige Nachrichten abgrenzen)', () => {
        expect(alsZitat('Erste\nZweite\nDritte')).toBe('> Erste\n> Zweite\n> Dritte');
    });

    it('lässt Leerzeilen als Zitatzeile stehen, statt die Abgrenzung dort aufzureißen', () => {
        expect(alsZitat('Oben\n\nUnten')).toBe('> Oben\n> \n> Unten');
    });
});

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
            expect(send).toHaveBeenCalledWith(expect.stringContaining('> Geheime Nachricht'));
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

            expect(send).toHaveBeenCalledWith(expect.stringContaining('> Alte Nachricht'));
            // Die Anhang-Zeile ist kein Nachrichteninhalt und bleibt deshalb außerhalb des Zitats.
            expect(send).toHaveBeenCalledWith(expect.stringContaining('\nAnhänge: bild.png'));
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

            expect(send).toHaveBeenCalledWith(expect.stringContaining('**Vorher:**\n> Alter Text'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('**Nachher:**\n> Neuer Text'));
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
        const mockMember = () => ({ id: 'user-1', user: { tag: 'Neuling#0001' } } as any);

        it('zählt den Beitritt auch dann, wenn kein Log-Channel konfiguriert ist', async () => {
            vi.mocked(memberService.zaehleBeitritt).mockResolvedValue(1);
            vi.mocked(loggingService.getLogChannel).mockResolvedValue(null);

            await loggingHandler.handleGuildMemberAdd(mockMember());

            expect(memberService.zaehleBeitritt).toHaveBeenCalledWith('user-1');
            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('loggt den ersten Beitritt ohne Zählung (die Zahl wäre dort keine Information)', async () => {
            const send = vi.fn();
            vi.mocked(memberService.zaehleBeitritt).mockResolvedValue(1);
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberAdd(mockMember());

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Neuling#0001'));
            expect(send).toHaveBeenCalledWith(expect.stringContaining('beigetreten'));
            expect(send).not.toHaveBeenCalledWith(expect.stringContaining('Mal'));
        });

        it('nennt beim Wiederkommen, das wievielte Mal es ist', async () => {
            const send = vi.fn();
            vi.mocked(memberService.zaehleBeitritt).mockResolvedValue(3);
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberAdd(mockMember());

            expect(send).toHaveBeenCalledWith(expect.stringContaining('bereits zum 3. Mal'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(memberService.zaehleBeitritt).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleGuildMemberAdd(mockMember())).resolves.not.toThrow();
        });
    });

    describe('handleGuildMemberRemove', () => {
        const mockMember = (joinedTimestamp: number | null = null) =>
            ({ user: { tag: 'Ex-User#0002' }, joinedTimestamp } as any);

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

        it('nennt die Mitgliedsdauer, wenn der Beitrittszeitpunkt bekannt ist', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberRemove(mockMember(Date.now() - 10 * 86400000));

            expect(send).toHaveBeenCalledWith(expect.stringContaining('war 10 Tage dabei'));
        });

        it('lässt die Dauer weg, wenn der Beitrittszeitpunkt fehlt', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleGuildMemberRemove(mockMember(null));

            expect(send).toHaveBeenCalledWith(expect.not.stringContaining('dabei'));
        });

        it('fängt Fehler beim Loggen ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleGuildMemberRemove(mockMember())).resolves.not.toThrow();
        });

        describe('Kick vs. freiwilliges Gehen (Audit-Log)', () => {
            const send = vi.fn();
            const mitGuild = (guild: any, joined: number | null = null) =>
                ({ id: 'user-1', user: { tag: 'Ex-User#0002' }, joinedTimestamp: joined, guild } as any);

            beforeEach(() => {
                send.mockReset();
                vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
                vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            });

            it('meldet einen Kick samt Urheber und Grund', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberKick, targetId: 'user-1', executorTag: 'Mod#1', reason: 'Regelverstoß' }]);

                await loggingHandler.handleGuildMemberRemove(mitGuild(guild));

                expect(send).toHaveBeenCalledWith(expect.stringContaining('wurde gekickt durch **Mod#1** (Grund: Regelverstoß)'));
            });

            it('nennt beim Kick auch die Mitgliedsdauer', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberKick, targetId: 'user-1', executorTag: 'Mod#1' }]);

                await loggingHandler.handleGuildMemberRemove(mitGuild(guild, Date.now() - 3 * 86400000));

                expect(send).toHaveBeenCalledWith(expect.stringContaining('war 3 Tage dabei'));
            });

            it('bleibt bei freiwilligem Gehen bei der Austritts-Meldung', async () => {
                await loggingHandler.handleGuildMemberRemove(mitGuild(mockGuild()));

                expect(send).toHaveBeenCalledWith(expect.stringContaining('hat den Server verlassen'));
            });

            it('ignoriert einen alten Kick-Eintrag derselben Person', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberKick, targetId: 'user-1', executorTag: 'Mod#1', alter: 60_000 }]);

                await loggingHandler.handleGuildMemberRemove(mitGuild(guild));

                expect(send).toHaveBeenCalledWith(expect.stringContaining('hat den Server verlassen'));
            });

            it('schweigt bei einem Bann - den loggt handleGuildBanAdd', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberBanAdd, targetId: 'user-1', executorTag: 'Mod#1' }]);

                await loggingHandler.handleGuildMemberRemove(mitGuild(guild));

                expect(send).not.toHaveBeenCalled();
            });

            it('meldet den Austritt auch ohne Audit-Log-Recht', async () => {
                const guild = { fetchAuditLogs: vi.fn().mockRejectedValue(new Error('Missing Permissions')) } as any;

                await loggingHandler.handleGuildMemberRemove(mitGuild(guild));

                expect(send).toHaveBeenCalledWith(expect.stringContaining('hat den Server verlassen'));
            });
        });
    });

    describe('handleAuditLogEntry', () => {
        const auditEintrag = (action: AuditLogEvent) => ({
            action,
            executor: { tag: 'Admin#1' },
            reason: null,
            changes: [],
            target: { name: 'Moderator' },
        } as any);

        it('postet Struktur-Änderungen in den Log-Channel', async () => {
            const send = vi.fn();
            vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await loggingHandler.handleAuditLogEntry(auditEintrag(AuditLogEvent.RoleDelete), {} as any);

            expect(send).toHaveBeenCalledWith(expect.stringContaining('Rolle **Moderator** wurde gelöscht'));
        });

        it('holt den Log-Channel gar nicht erst für uninteressante Einträge', async () => {
            await loggingHandler.handleAuditLogEntry(auditEintrag(AuditLogEvent.MessageDelete), {} as any);

            expect(loggingService.getLogChannel).not.toHaveBeenCalled();
        });

        it('fängt Fehler ab', async () => {
            vi.mocked(loggingService.getLogChannel).mockRejectedValue(new Error('Redis kaputt'));

            await expect(loggingHandler.handleAuditLogEntry(auditEintrag(AuditLogEvent.RoleDelete), {} as any)).resolves.not.toThrow();
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

        describe('Urheber aus dem Audit-Log', () => {
            const send = vi.fn();

            beforeEach(() => {
                send.mockReset();
                vi.mocked(loggingService.getLogChannel).mockResolvedValue('log-channel-1');
                vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);
            });

            it('nennt, wer eine Rolle vergeben hat', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberRoleUpdate, targetId: 'user-1', executorTag: 'Admin#1' }]);
                const oldMember = mockMember([], { id: 'user-1', guild });
                const newMember = mockMember([{ id: 'r2', name: 'Einwohner' }], { id: 'user-1', guild });

                await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

                expect(send).toHaveBeenCalledWith(expect.stringContaining('erhalten durch **Admin#1**.'));
            });

            it('nennt, wer stummgeschaltet hat', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberUpdate, targetId: 'user-1', executorTag: 'Mod#1', reason: 'Ruhe' }]);
                const bis = Date.now() + 600000;
                const oldMember = mockMember([], { id: 'user-1', guild, communicationDisabledUntilTimestamp: null });
                const newMember = mockMember([], { id: 'user-1', guild, communicationDisabledUntilTimestamp: bis });

                await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

                expect(send).toHaveBeenCalledWith(expect.stringContaining('durch **Mod#1** (Grund: Ruhe)'));
            });

            it('sagt nicht "durch sich selbst", wenn jemand den eigenen Nickname ändert', async () => {
                const guild = mockGuild([{ action: AuditLogEvent.MemberUpdate, targetId: 'user-1', executorTag: 'User#0001' }]);
                const oldMember = mockMember([], { id: 'user-1', guild, nickname: null });
                const newMember = mockMember([], { id: 'user-1', guild, nickname: 'Neu' });

                await loggingHandler.handleGuildMemberUpdate(oldMember, newMember);

                expect(send).toHaveBeenCalledWith(expect.not.stringContaining('durch'));
            });
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
