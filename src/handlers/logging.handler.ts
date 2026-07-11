import {ChatInputCommandInteraction, GuildBan, GuildMember, GuildTextBasedChannel, Message, MessageFlags, PartialGuildMember, PartialMessage, PermissionFlagsBits, ReadonlyCollection, TextChannel} from 'discord.js';
import client from '../client.js';
import loggingService, {CachedMessage} from '../services/logging.service.js';

// Anhänge werden nur mit Dateinamen protokolliert (die CDN-Links funktionieren nach dem Löschen
// ohnehin nicht mehr, und die Dateien selbst spiegeln wir bewusst nicht).
function formatAttachments(attachments: string[]): string {
    return attachments.length ? `\nAnhänge: ${attachments.join(', ')}` : '';
}

class LoggingHandler {
    // Merkt sich Inhalt + Anhang-Namen einer Nachricht, damit beim Löschen/Bearbeiten der alte
    // Stand noch da ist (discord.js hält nur einen RAM-Cache, der jeden Neustart verliert).
    // Gespeichert wird NUR, wenn ein Log-Channel konfiguriert ist - ohne Logging speichert der Bot nichts.
    async handleMessageCreate(message: Message) {
        try {
            if (!message.guild) return;
            if (message.author.bot) return;
            if (!await loggingService.getLogChannel()) return;

            await loggingService.cacheMessage(message.id, {
                authorTag: message.author.tag,
                content: message.content,
                attachments: message.attachments.map(attachment => attachment.name),
            });
        } catch (error) {
            console.error('Fehler beim Zwischenspeichern der Nachricht:', error);
        }
    }

    async handleSetChannel(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('kanal', true);
        await loggingService.setLogChannel(channel.id);

        return interaction.reply(
            `Bearbeitete/gelöschte Nachrichten werden ab jetzt in <#${channel.id}> geloggt.`
        );
    }

    async handleMessageDelete(message: Message | PartialMessage) {
        try {
            if (!message.guild) return;
            if (message.author?.bot) return;

            // Auch bei nicht gecachter Nachricht: der eigene Redis-Cache kennt sie ggf. noch.
            const cached = await loggingService.getCachedMessage(message.id);

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            const author = message.author?.tag ?? cached?.authorTag ?? 'Unbekannt';
            const content = this.resolveContent(message, cached);
            const attachments = formatAttachments(
                message.partial ? (cached?.attachments ?? []) : message.attachments.map(attachment => attachment.name)
            );

            await logChannel.send(
                `🗑️ **Nachricht gelöscht** – ${author} in <#${message.channelId}>\n${content}${attachments}`
            );

            // Gelöscht ist gelöscht - den Inhalt danach nicht länger als nötig vorhalten.
            await loggingService.deleteCachedMessage(message.id);
        } catch (error) {
            console.error('Fehler beim Loggen der gelöschten Nachricht:', error);
        }
    }

    async handleMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
        try {
            if (!newMessage.guild) return;
            if (newMessage.author?.bot) return;

            const cached = await loggingService.getCachedMessage(newMessage.id);
            // Alter Stand: erst der RAM-Cache von discord.js, sonst unser Redis-Cache.
            const oldContent = oldMessage.partial ? (cached?.content ?? null) : oldMessage.content;
            const newContent = newMessage.partial ? null : newMessage.content;

            // Discord feuert MessageUpdate auch ohne echte Änderung (z.B. beim Nachladen von
            // Link-Embeds) - nur loggen, wenn sich der Text nachweislich unterscheidet.
            if (oldContent !== null && newContent !== null && oldContent === newContent) return;

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            const author = newMessage.author?.tag ?? cached?.authorTag ?? 'Unbekannt';

            await logChannel.send(
                `✏️ **Nachricht bearbeitet** – ${author} in <#${newMessage.channelId}>\n` +
                `Vorher: ${oldContent === null ? '*nicht verfügbar*' : (oldContent || '*kein Text*')}\n` +
                `Nachher: ${newContent === null ? '*nicht verfügbar*' : (newContent || '*kein Text*')}`
            );

            // Ab jetzt ist der neue Stand der "alte" für die nächste Bearbeitung.
            if (!newMessage.partial && newMessage.author) {
                await loggingService.cacheMessage(newMessage.id, {
                    authorTag: newMessage.author.tag,
                    content: newMessage.content,
                    attachments: newMessage.attachments.map(attachment => attachment.name),
                });
            }
        } catch (error) {
            console.error('Fehler beim Loggen der bearbeiteten Nachricht:', error);
        }
    }

    private resolveContent(message: Message | PartialMessage, cached: CachedMessage | null): string {
        if (!message.partial) return message.content || cached?.content || '*kein Text*';
        if (cached) return cached.content || '*kein Text*';
        return '*Inhalt nicht verfügbar (Nachricht ist älter als der Log-Speicher)*';
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

    async handleGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        try {
            // Ohne gecachtes altes Mitglied kein Diff möglich - dann lieber nichts loggen
            // als z.B. falsche "Rolle erhalten"-Meldungen für alle bestehenden Rollen.
            if (oldMember.partial) return;

            const tag = newMember.user.tag;
            const messages: string[] = [];

            // Rollen
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;
            for (const role of newRoles.filter(role => !oldRoles.has(role.id)).values()) {
                messages.push(`➕ **${tag}** hat die Rolle **${role.name}** erhalten.`);
            }
            for (const role of oldRoles.filter(role => !newRoles.has(role.id)).values()) {
                messages.push(`➖ **${tag}** hat die Rolle **${role.name}** verloren.`);
            }

            // Nickname
            if (oldMember.nickname !== newMember.nickname) {
                if (!newMember.nickname) {
                    messages.push(`🏷️ **${tag}** hat den Nickname **${oldMember.nickname}** entfernt.`);
                } else if (!oldMember.nickname) {
                    messages.push(`🏷️ **${tag}** hat sich den Nickname **${newMember.nickname}** gegeben.`);
                } else {
                    messages.push(`🏷️ **${tag}** hat den Nickname von **${oldMember.nickname}** zu **${newMember.nickname}** geändert.`);
                }
            }

            // Timeout / Mute
            const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
            const newTimeout = newMember.communicationDisabledUntilTimestamp;
            if (oldTimeout !== newTimeout) {
                if (newTimeout && newTimeout > Date.now()) {
                    messages.push(`🔇 **${tag}** wurde bis <t:${Math.floor(newTimeout / 1000)}:f> stummgeschaltet (Timeout).`);
                } else if (oldTimeout && oldTimeout > Date.now()) {
                    messages.push(`🔊 Der Timeout von **${tag}** wurde aufgehoben.`);
                }
            }

            if (!messages.length) return;

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            for (const message of messages) {
                await logChannel.send(message);
            }
        } catch (error) {
            console.error('Fehler beim Loggen der Mitglieds-Änderung:', error);
        }
    }

    async handleGuildBanAdd(ban: GuildBan) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            const reason = ban.reason ? ` (Grund: ${ban.reason})` : '';
            await logChannel.send(`🔨 **${ban.user.tag}** wurde gebannt.${reason}`);
        } catch (error) {
            console.error('Fehler beim Loggen des Banns:', error);
        }
    }

    async handleGuildBanRemove(ban: GuildBan) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            await logChannel.send(`♻️ Der Bann von **${ban.user.tag}** wurde aufgehoben.`);
        } catch (error) {
            console.error('Fehler beim Loggen der Bann-Aufhebung:', error);
        }
    }

    async handleMessageBulkDelete(messages: ReadonlyCollection<string, Message | PartialMessage>, channel: GuildTextBasedChannel) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            await logChannel.send(`🧹 **${messages.size}** Nachrichten wurden in <#${channel.id}> gelöscht (Massen-Löschung).`);
        } catch (error) {
            console.error('Fehler beim Loggen der Massen-Löschung:', error);
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
