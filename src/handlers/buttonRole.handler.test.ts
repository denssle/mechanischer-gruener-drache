import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags } from 'discord.js';
import buttonRoleHandler from './buttonRole.handler.js';

// Bot-Mitglied: standardmäßig mit "Rollen verwalten" und über der Zielrolle in der Hierarchie.
const mockMe = (canManage = true, aboveTarget = true) => ({
    permissions: { has: vi.fn().mockReturnValue(canManage) },
    roles: { highest: { comparePositionTo: vi.fn().mockReturnValue(aboveTarget ? 1 : 0) } },
});

describe('ButtonRoleHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('handleCreate', () => {
        const mockInteraction = (overrides: any = {}) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(true) },
            options: {
                getString: vi.fn((name: string) => {
                    if (name === 'text') return 'Klick mich';
                    if (name === 'beschriftung') return 'Regeln akzeptieren';
                    if (name === 'emoji') return null;
                    return null;
                }),
                getRole: vi.fn().mockReturnValue({ id: 'role-1', name: 'Einwohner' }),
            },
            channel: {
                isTextBased: () => true,
                send: vi.fn().mockResolvedValue({}),
            },
            guild: {
                members: { me: mockMe() },
                roles: { cache: new Map([['role-1', { id: 'role-1', name: 'Einwohner' }]]) },
            },
            reply: vi.fn(),
            ...overrides,
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction({ memberPermissions: { has: vi.fn().mockReturnValue(false) } });

            await buttonRoleHandler.handleCreate(interaction);

            expect(interaction.channel.send).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('lehnt ab wenn im Channel nicht gepostet werden kann', async () => {
            const interaction = mockInteraction({ channel: { isTextBased: () => false } });

            await buttonRoleHandler.handleCreate(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('keine Nachricht posten')
            }));
        });

        it('lehnt ab wenn dem Bot "Rollen verwalten" fehlt', async () => {
            const interaction = mockInteraction({
                guild: { members: { me: mockMe(false) }, roles: { cache: new Map([['role-1', { id: 'role-1', name: 'Einwohner' }]]) } }
            });

            await buttonRoleHandler.handleCreate(interaction);

            expect(interaction.channel.send).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Rollen verwalten')
            }));
        });

        it('lehnt ab wenn die Zielrolle über der Bot-Rolle steht', async () => {
            const interaction = mockInteraction({
                guild: { members: { me: mockMe(true, false) }, roles: { cache: new Map([['role-1', { id: 'role-1', name: 'Einwohner' }]]) } }
            });

            await buttonRoleHandler.handleCreate(interaction);

            expect(interaction.channel.send).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Hierarchie')
            }));
        });

        it('postet eine Button-Nachricht mit der Rolle in der customId', async () => {
            const interaction = mockInteraction();

            await buttonRoleHandler.handleCreate(interaction);

            expect(interaction.channel.send).toHaveBeenCalledTimes(1);
            const sent = interaction.channel.send.mock.calls[0][0];
            expect(sent.content).toBe('Klick mich');
            const button = sent.components[0].toJSON().components[0];
            expect(button.custom_id).toBe('role-toggle:role-1');
            expect(button.label).toBe('Regeln akzeptieren');
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Einwohner'),
                flags: MessageFlags.Ephemeral,
            }));
        });

        it('wandelt literal getipptes \\n in echte Zeilenumbrüche um', async () => {
            const interaction = mockInteraction({
                options: {
                    getString: vi.fn((name: string) => {
                        if (name === 'text') return 'Zeile 1\\nZeile 2';
                        if (name === 'beschriftung') return 'Regeln akzeptieren';
                        if (name === 'emoji') return null;
                        return null;
                    }),
                    getRole: vi.fn().mockReturnValue({ id: 'role-1', name: 'Einwohner' }),
                },
            });

            await buttonRoleHandler.handleCreate(interaction);

            expect(interaction.channel.send.mock.calls[0][0].content).toBe('Zeile 1\nZeile 2');
        });

        it('setzt ein Emoji auf den Button wenn angegeben', async () => {
            const interaction = mockInteraction({
                options: {
                    getString: vi.fn((name: string) => {
                        if (name === 'text') return 'Klick mich';
                        if (name === 'beschriftung') return 'Regeln akzeptieren';
                        if (name === 'emoji') return '✅';
                        return null;
                    }),
                    getRole: vi.fn().mockReturnValue({ id: 'role-1', name: 'Einwohner' }),
                },
            });

            await buttonRoleHandler.handleCreate(interaction);

            const button = interaction.channel.send.mock.calls[0][0].components[0].toJSON().components[0];
            expect(button.emoji?.name).toBe('✅');
        });
    });

    describe('handleButton', () => {
        // interaction.member ist im Test ein Plain-Object (kein GuildMember), deshalb
        // greift im Handler der guild.members.fetch-Fallback und liefert diesen Mock.
        const mockMember = (hasRole = false) => ({
            roles: {
                cache: new Map<string, unknown>(hasRole ? [['role-1', {}]] : []),
                add: vi.fn(),
                remove: vi.fn(),
            },
        });

        const mockInteraction = (overrides: any = {}) => {
            const member = overrides.member ?? mockMember();
            const me = overrides.me ?? mockMe();
            return {
                customId: 'role-toggle:role-1',
                member: {},
                user: { id: 'user-1' },
                guild: {
                    roles: { cache: new Map([['role-1', { id: 'role-1', name: 'Einwohner' }]]) },
                    members: { fetch: vi.fn().mockResolvedValue(member), me },
                },
                reply: vi.fn().mockResolvedValue(undefined),
                replied: false,
                ...overrides,
                _member: member,
            } as any;
        };

        it('ignoriert Buttons mit fremdem Präfix', async () => {
            const interaction = mockInteraction({ customId: 'irgendwas-anderes' });

            await buttonRoleHandler.handleButton(interaction);

            expect(interaction.reply).not.toHaveBeenCalled();
        });

        it('vergibt die Rolle wenn der User sie noch nicht hat', async () => {
            const interaction = mockInteraction();

            await buttonRoleHandler.handleButton(interaction);

            expect(interaction._member.roles.add).toHaveBeenCalledWith('role-1');
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Einwohner'),
                flags: MessageFlags.Ephemeral,
            }));
        });

        it('entfernt die Rolle wenn der User sie schon hat', async () => {
            const member = mockMember(true);
            const interaction = mockInteraction({ member });

            await buttonRoleHandler.handleButton(interaction);

            expect(member.roles.remove).toHaveBeenCalledWith('role-1');
            expect(member.roles.add).not.toHaveBeenCalled();
        });

        it('lehnt ab wenn dem Bot "Rollen verwalten" fehlt', async () => {
            const interaction = mockInteraction({ me: mockMe(false) });

            await buttonRoleHandler.handleButton(interaction);

            expect(interaction._member.roles.add).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Rollen verwalten')
            }));
        });

        it('lehnt ab wenn die Rolle über der Bot-Rolle steht', async () => {
            const interaction = mockInteraction({ me: mockMe(true, false) });

            await buttonRoleHandler.handleButton(interaction);

            expect(interaction._member.roles.add).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Hierarchie')
            }));
        });

        it('fängt Fehler ab und antwortet dem User', async () => {
            const member = mockMember();
            member.roles.add = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
            const interaction = mockInteraction({ member });

            await expect(buttonRoleHandler.handleButton(interaction)).resolves.not.toThrow();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('nicht geklappt')
            }));
        });
    });
});
