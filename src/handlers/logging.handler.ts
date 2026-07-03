import {ChatInputCommandInteraction, GuildMember, Message, PartialGuildMember, PartialMessage, PermissionFlagsBits, TextChannel} from 'discord.js';
import client from '../client.js';
import loggingService from '../services/logging.service.js';

class LoggingHandler {
    async handleSetChannel(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel', true);
        await loggingService.setLogChannel(channel.id);

        return interaction.reply(
            `✅ Bearbeitete/gelöschte Nachrichten werden ab jetzt in <#${channel.id}> geloggt.`
        );
    }

    async handleMessageDelete(message: Message | PartialMessage) {
        try {
            if (!message.guild) return;
            if (message.author?.bot) return;

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            const author = message.author ? message.author.tag : 'Unbekannt';
            const content = message.partial
                ? '*Inhalt nicht verfügbar (Nachricht war nicht im Cache)*'
                : (message.content || '*kein Text*');

            await logChannel.send(
                `🗑️ **Nachricht gelöscht** – ${author} in <#${message.channelId}>\n${content}`
            );
        } catch (error) {
            console.error('Fehler beim Loggen der gelöschten Nachricht:', error);
        }
    }

    async handleMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
        try {
            if (!newMessage.guild) return;
            if (newMessage.author?.bot) return;
            if (!oldMessage.partial && !newMessage.partial && oldMessage.content === newMessage.content) return;

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            const author = newMessage.author ? newMessage.author.tag : 'Unbekannt';
            const oldContent = oldMessage.partial
                ? '*nicht verfügbar (nicht im Cache)*'
                : (oldMessage.content || '*kein Text*');
            const newContent = newMessage.partial
                ? '*nicht verfügbar*'
                : (newMessage.content || '*kein Text*');

            await logChannel.send(
                `✏️ **Nachricht bearbeitet** – ${author} in <#${newMessage.channelId}>\n` +
                `Vorher: ${oldContent}\n` +
                `Nachher: ${newContent}`
            );
        } catch (error) {
            console.error('Fehler beim Loggen der bearbeiteten Nachricht:', error);
        }
    }

    async handleGuildMemberAdd(member: GuildMember) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            await logChannel.send(`📥 **${member.user.tag}** ist dem Server beigetreten.`);
        } catch (error) {
            console.error('Fehler beim Loggen des Server-Beitritts:', error);
        }
    }

    async handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            await logChannel.send(`📤 **${member.user.tag}** hat den Server verlassen.`);
        } catch (error) {
            console.error('Fehler beim Loggen des Server-Austritts:', error);
        }
    }

    private async getLogChannel(): Promise<TextChannel | null> {
        const channelId = await loggingService.getLogChannel();
        if (!channelId) return null;

        return await client.channels.fetch(channelId) as TextChannel | null;
    }
}

const loggingHandler = new LoggingHandler();

export default loggingHandler;
