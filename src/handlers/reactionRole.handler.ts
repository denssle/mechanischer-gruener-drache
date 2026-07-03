import {
    ChatInputCommandInteraction,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    PermissionFlagsBits,
    User
} from 'discord.js';
import reactionRoleService from '../services/reactionRole.service.js';

const CUSTOM_EMOJI_PATTERN = /^<a?:\w+:(\d+)>$/;

// Discord liefert für Custom-Emojis eine ID (stabil), für Standard-Emojis nur den
// Unicode-Character selbst. Der Key muss zwischen Registrierung (Text-Input) und
// live ankommenden Reactions (reaction.emoji) übereinstimmen.
function toEmojiKey(emoji: string): string {
    const match = emoji.match(CUSTOM_EMOJI_PATTERN);
    return match ? match[1] : emoji;
}

class ReactionRoleHandler {
    async handleAdd(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        const messageId = interaction.options.getString('message-id', true);
        const emojiInput = interaction.options.getString('emoji', true);
        const role = interaction.options.getRole('rolle', true);

        if (!interaction.channel?.isTextBased()) {
            return interaction.reply({ content: '❌ Dieser Channel unterstützt keine Nachrichten.', ephemeral: true });
        }

        let message;
        try {
            message = await interaction.channel.messages.fetch(messageId);
        } catch {
            return interaction.reply({
                content: '❌ Nachricht mit dieser ID wurde in diesem Channel nicht gefunden. Der Befehl muss im selben Channel wie die Nachricht ausgeführt werden.',
                ephemeral: true
            });
        }

        try {
            await message.react(emojiInput);
        } catch {
            return interaction.reply({ content: '❌ Konnte nicht mit diesem Emoji reagieren – ist es gültig?', ephemeral: true });
        }

        await reactionRoleService.setBinding(messageId, toEmojiKey(emojiInput), role.id);

        return interaction.reply(
            `✅ Wer mit ${emojiInput} auf die Nachricht reagiert, bekommt ab jetzt die Rolle **${role.name}**.`
        );
    }

    async handleRemove(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        const messageId = interaction.options.getString('message-id', true);
        const emojiInput = interaction.options.getString('emoji', true);

        const removed = await reactionRoleService.removeBinding(messageId, toEmojiKey(emojiInput));
        if (!removed) {
            return interaction.reply({
                content: '❌ Für diese Nachricht/Emoji-Kombination war keine Rolle hinterlegt.',
                ephemeral: true
            });
        }

        return interaction.reply('✅ Reaction-Role-Verknüpfung entfernt.');
    }

    async handleReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        try {
            if (user.bot) return;
            await this.applyRole(reaction, user.id, true);
        } catch (error) {
            console.error('Fehler beim Zuweisen der Reaction-Role:', error);
        }
    }

    async handleReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        try {
            if (user.bot) return;
            await this.applyRole(reaction, user.id, false);
        } catch (error) {
            console.error('Fehler beim Entfernen der Reaction-Role:', error);
        }
    }

    private async applyRole(reaction: MessageReaction | PartialMessageReaction, userId: string, add: boolean) {
        const fullReaction = reaction.partial ? await reaction.fetch() : reaction;

        const emojiKey = fullReaction.emoji.id ?? fullReaction.emoji.name;
        if (!emojiKey) return;

        const roleId = await reactionRoleService.getBinding(fullReaction.message.id, emojiKey);
        if (!roleId) return;

        const guild = fullReaction.message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(userId);
        if (add) {
            await member.roles.add(roleId);
        } else {
            await member.roles.remove(roleId);
        }
    }
}

export default new ReactionRoleHandler();
