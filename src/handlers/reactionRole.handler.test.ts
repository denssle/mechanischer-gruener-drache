import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/reactionRole.service.js', () => ({
    default: {
        setBinding: vi.fn(),
        getBinding: vi.fn(),
        removeBinding: vi.fn(),
    }
}));

import reactionRoleService from '../services/reactionRole.service.js';
import reactionRoleHandler from './reactionRole.handler.js';

describe('ReactionRoleHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('handleAdd', () => {
        const mockInteraction = (overrides = {}) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(true) },
            options: {
                getString: vi.fn((name: string) => (name === 'message-id' ? 'msg-1' : '✅')),
                getRole: vi.fn().mockReturnValue({ id: 'role-1', name: 'Regeln akzeptiert' }),
            },
            channel: {
                isTextBased: () => true,
                messages: { fetch: vi.fn().mockResolvedValue({ react: vi.fn() }) },
            },
            reply: vi.fn(),
            ...overrides,
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction({ memberPermissions: { has: vi.fn().mockReturnValue(false) } });

            await reactionRoleHandler.handleAdd(interaction);

            expect(reactionRoleService.setBinding).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('lehnt ab wenn der Channel keine Nachrichten unterstützt', async () => {
            const interaction = mockInteraction({ channel: { isTextBased: () => false } });

            await reactionRoleHandler.handleAdd(interaction);

            expect(reactionRoleService.setBinding).not.toHaveBeenCalled();
        });

        it('lehnt ab wenn die Nachricht nicht gefunden wird', async () => {
            const interaction = mockInteraction({
                channel: { isTextBased: () => true, messages: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Message')) } }
            });

            await reactionRoleHandler.handleAdd(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('nicht gefunden')
            }));
        });

        it('lehnt ab wenn das Reagieren fehlschlägt', async () => {
            const interaction = mockInteraction({
                channel: {
                    isTextBased: () => true,
                    messages: { fetch: vi.fn().mockResolvedValue({ react: vi.fn().mockRejectedValue(new Error('Unknown Emoji')) }) }
                }
            });

            await reactionRoleHandler.handleAdd(interaction);

            expect(reactionRoleService.setBinding).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Emoji')
            }));
        });

        it('legt die Bindung an, reagiert auf die Nachricht und bestätigt', async () => {
            const react = vi.fn();
            const interaction = mockInteraction({
                channel: { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue({ react }) } }
            });

            await reactionRoleHandler.handleAdd(interaction);

            expect(react).toHaveBeenCalledWith('✅');
            expect(reactionRoleService.setBinding).toHaveBeenCalledWith('msg-1', '✅', 'role-1');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('Regeln akzeptiert'));
        });

        it('extrahiert bei Custom-Emojis die ID als Key', async () => {
            const react = vi.fn();
            const interaction = mockInteraction({
                options: {
                    getString: vi.fn((name: string) => (name === 'message-id' ? 'msg-1' : '<:pog:123456789>')),
                    getRole: vi.fn().mockReturnValue({ id: 'role-1', name: 'Rolle' }),
                },
                channel: { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue({ react }) } },
            });

            await reactionRoleHandler.handleAdd(interaction);

            expect(reactionRoleService.setBinding).toHaveBeenCalledWith('msg-1', '123456789', 'role-1');
        });
    });

    describe('handleRemove', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getString: vi.fn((name: string) => (name === 'message-id' ? 'msg-1' : '✅')) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await reactionRoleHandler.handleRemove(interaction);

            expect(reactionRoleService.removeBinding).not.toHaveBeenCalled();
        });

        it('meldet wenn keine Bindung existiert', async () => {
            vi.mocked(reactionRoleService.removeBinding).mockResolvedValue(false);
            const interaction = mockInteraction(true);

            await reactionRoleHandler.handleRemove(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('keine Rolle hinterlegt')
            }));
        });

        it('entfernt eine bestehende Bindung', async () => {
            vi.mocked(reactionRoleService.removeBinding).mockResolvedValue(true);
            const interaction = mockInteraction(true);

            await reactionRoleHandler.handleRemove(interaction);

            expect(reactionRoleService.removeBinding).toHaveBeenCalledWith('msg-1', '✅');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('entfernt'));
        });
    });

    const mockReaction = (overrides = {}) => ({
        partial: false,
        emoji: { id: null, name: '✅' },
        message: {
            id: 'msg-1',
            guild: { members: { fetch: vi.fn().mockResolvedValue({ roles: { add: vi.fn(), remove: vi.fn() } }) } },
        },
        fetch: vi.fn(),
        ...overrides,
    } as any);

    describe('handleReactionAdd', () => {
        it('ignoriert Bot-User', async () => {
            const reaction = mockReaction();

            await reactionRoleHandler.handleReactionAdd(reaction, { id: 'bot-1', bot: true } as any);

            expect(reactionRoleService.getBinding).not.toHaveBeenCalled();
        });

        it('tut nichts wenn keine Bindung für diese Nachricht/Emoji existiert', async () => {
            vi.mocked(reactionRoleService.getBinding).mockResolvedValue(null);
            const reaction = mockReaction();

            await reactionRoleHandler.handleReactionAdd(reaction, { id: 'user-1', bot: false } as any);

            expect(reaction.message.guild.members.fetch).not.toHaveBeenCalled();
        });

        it('vergibt die Rolle bei passender Bindung', async () => {
            vi.mocked(reactionRoleService.getBinding).mockResolvedValue('role-1');
            const roleAdd = vi.fn();
            const reaction = mockReaction({
                message: { id: 'msg-1', guild: { members: { fetch: vi.fn().mockResolvedValue({ roles: { add: roleAdd } }) } } }
            });

            await reactionRoleHandler.handleReactionAdd(reaction, { id: 'user-1', bot: false } as any);

            expect(reactionRoleService.getBinding).toHaveBeenCalledWith('msg-1', '✅');
            expect(roleAdd).toHaveBeenCalledWith('role-1');
        });

        it('fetcht eine partial Reaction bevor sie verwendet wird', async () => {
            vi.mocked(reactionRoleService.getBinding).mockResolvedValue(null);
            const fullReaction = mockReaction();
            const reaction = mockReaction({ partial: true, fetch: vi.fn().mockResolvedValue(fullReaction) });

            await reactionRoleHandler.handleReactionAdd(reaction, { id: 'user-1', bot: false } as any);

            expect(reaction.fetch).toHaveBeenCalled();
        });

        it('extrahiert bei Custom-Emojis die ID aus reaction.emoji.id', async () => {
            vi.mocked(reactionRoleService.getBinding).mockResolvedValue(null);
            const reaction = mockReaction({ emoji: { id: '123456789', name: 'pog' } });

            await reactionRoleHandler.handleReactionAdd(reaction, { id: 'user-1', bot: false } as any);

            expect(reactionRoleService.getBinding).toHaveBeenCalledWith('msg-1', '123456789');
        });

        it('fängt Fehler ab', async () => {
            vi.mocked(reactionRoleService.getBinding).mockRejectedValue(new Error('Redis kaputt'));
            const reaction = mockReaction();

            await expect(reactionRoleHandler.handleReactionAdd(reaction, { id: 'user-1', bot: false } as any)).resolves.not.toThrow();
        });
    });

    describe('handleReactionRemove', () => {
        it('entzieht die Rolle bei passender Bindung', async () => {
            vi.mocked(reactionRoleService.getBinding).mockResolvedValue('role-1');
            const roleRemove = vi.fn();
            const reaction = mockReaction({
                message: { id: 'msg-1', guild: { members: { fetch: vi.fn().mockResolvedValue({ roles: { remove: roleRemove } }) } } }
            });

            await reactionRoleHandler.handleReactionRemove(reaction, { id: 'user-1', bot: false } as any);

            expect(roleRemove).toHaveBeenCalledWith('role-1');
        });

        it('ignoriert Bot-User', async () => {
            const reaction = mockReaction();

            await reactionRoleHandler.handleReactionRemove(reaction, { id: 'bot-1', bot: true } as any);

            expect(reactionRoleService.getBinding).not.toHaveBeenCalled();
        });
    });
});
