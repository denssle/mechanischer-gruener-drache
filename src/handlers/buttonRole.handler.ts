import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    GuildMember,
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
                ephemeral: true
            });
        }

        const text = interaction.options.getString('text', true);
        const role = interaction.options.getRole('rolle', true);
        const label = interaction.options.getString('beschriftung', true);
        const emoji = interaction.options.getString('emoji');

        if (!interaction.channel?.isTextBased() || !('send' in interaction.channel)) {
            return interaction.reply({ content: '❌ In diesem Channel kann ich keine Nachricht posten.', ephemeral: true });
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
            ephemeral: true
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

            const roleName = guild.roles.cache.get(roleId)?.name ?? 'Rolle';

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                await interaction.reply({ content: `➖ Rolle **${roleName}** entfernt.`, ephemeral: true });
            } else {
                await member.roles.add(roleId);
                await interaction.reply({ content: `✅ Du hast jetzt die Rolle **${roleName}**.`, ephemeral: true });
            }
        } catch (error) {
            console.error('Fehler beim Umschalten der Button-Rolle:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Das hat nicht geklappt. Bitte melde dich bei einem Admin.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
}

export default new ButtonRoleHandler();
