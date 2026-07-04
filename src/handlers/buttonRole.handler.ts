import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits
} from 'discord.js';

// Die Rolle steckt direkt in der customId des Buttons (role-toggle:{roleId}) - dadurch
// braucht es keinen Redis-State, und die Bindung überlebt jeden Bot-Neustart automatisch.
const CUSTOM_ID_PREFIX = 'role-toggle:';

class ButtonRoleHandler {
    async handleCreate(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const text = interaction.options.getString('text', true);
        const role = interaction.options.getRole('rolle', true);
        const label = interaction.options.getString('beschriftung', true);
        const emoji = interaction.options.getString('emoji');

        if (!interaction.channel?.isTextBased() || !('send' in interaction.channel)) {
            return interaction.reply({ content: '❌ In diesem Channel kann ich keine Nachricht posten.', flags: MessageFlags.Ephemeral });
        }

        // Direkt beim Erstellen prüfen, ob der Bot die Rolle überhaupt vergeben kann -
        // sonst klickt später jemand und bekommt nur "Missing Permissions".
        const guild = interaction.guild;
        const me = guild?.members.me;
        if (!guild || !me) {
            return interaction.reply({ content: '❌ Dieser Befehl funktioniert nur auf einem Server.', flags: MessageFlags.Ephemeral });
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: '❌ Mir fehlt die Berechtigung **Rollen verwalten**. Bitte gib sie mir in den Server-Einstellungen.',
                flags: MessageFlags.Ephemeral
            });
        }

        const targetRole = guild.roles.cache.get(role.id);
        if (targetRole && me.roles.highest.comparePositionTo(targetRole) <= 0) {
            return interaction.reply({
                content: `❌ Die Rolle **${role.name}** steht in der Rollen-Hierarchie gleich hoch oder höher als meine höchste Rolle. `
                    + 'Ziehe meine Bot-Rolle in den Server-Einstellungen **über** diese Rolle.',
                flags: MessageFlags.Ephemeral
            });
        }

        const button = new ButtonBuilder()
            .setCustomId(`${CUSTOM_ID_PREFIX}${role.id}`)
            .setLabel(label)
            .setStyle(ButtonStyle.Primary);

        if (emoji) {
            button.setEmoji(emoji);
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        await interaction.channel.send({ content: text, components: [row] });

        return interaction.reply({
            content: `✅ Button-Nachricht gepostet. Wer klickt, bekommt die Rolle **${role.name}** (nochmal klicken entfernt sie wieder).`,
            flags: MessageFlags.Ephemeral
        });
    }

    async handleButton(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return;

        try {
            const roleId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);
            const guild = interaction.guild;
            if (!guild) return;

            const member = interaction.member instanceof GuildMember
                ? interaction.member
                : await guild.members.fetch(interaction.user.id);

            const role = guild.roles.cache.get(roleId);
            const roleName = role?.name ?? 'Rolle';

            const me = guild.members.me;
            if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({
                    content: '❌ Mir fehlt die Berechtigung **Rollen verwalten**. Bitte melde dich bei einem Admin.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (role && me.roles.highest.comparePositionTo(role) <= 0) {
                return interaction.reply({
                    content: `❌ Ich kann die Rolle **${roleName}** nicht vergeben, weil sie in der Hierarchie über meiner Bot-Rolle steht. `
                        + 'Bitte melde dich bei einem Admin.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                await interaction.reply({ content: `➖ Rolle **${roleName}** entfernt.`, flags: MessageFlags.Ephemeral });
            } else {
                await member.roles.add(roleId);
                await interaction.reply({ content: `✅ Du hast jetzt die Rolle **${roleName}**.`, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error('Fehler beim Umschalten der Button-Rolle:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Das hat nicht geklappt. Bitte melde dich bei einem Admin.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }
}

export default new ButtonRoleHandler();
