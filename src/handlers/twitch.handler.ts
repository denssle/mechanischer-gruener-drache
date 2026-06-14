import {ChatInputCommandInteraction, PermissionFlagsBits, TextChannel} from "discord.js";
import twitchUserService from "../services/twitch.user.service.js";
import twitchService from "../services/twitch.service.js";
import {StreamOnlineEvent} from "../types/steamOnlineEvent.js";
import client from "../client.js";
import userService from "../services/user.service.js";

class TwitchHandler {
    async handleSet(interaction: ChatInputCommandInteraction) {
        const twitchLogin = interaction.options.getString('channel', true).toLowerCase();

        await interaction.deferReply();

        // Prüfen ob User schon eine Verknüpfung hat
        const existingLink = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (existingLink) {
            return interaction.editReply(
                `Du hast bereits **${existingLink.twitchDisplayName}** verknüpft. ` +
                `Nutze \`/twitch remove\` um die Verknüpfung zuerst zu entfernen.`
            );
        }

        // Twitch User suchen
        const twitchUser = await twitchService.getUserByLogin(twitchLogin);
        if (!twitchUser) {
            return interaction.editReply(`❌ Twitch-Channel **${twitchLogin}** nicht gefunden.`);
        }

        // EventSub-Subscription registrieren
        const subscriptionId = await twitchService.subscribeToStreamOnline(twitchUser.id);
        if (!subscriptionId) {
            return interaction.editReply('❌ Fehler beim Registrieren der Twitch-Benachrichtigung.');
        }

        // Verknüpfung speichern
        await twitchUserService.linkUser(
            interaction.user.id,
            twitchUser.id,
            twitchUser.login,
            twitchUser.display_name,
            subscriptionId
        );

        return interaction.editReply(
            `✅ Twitch-Channel **${twitchUser.display_name}** erfolgreich verknüpft!\n` +
            `Du bekommst ab jetzt eine Benachrichtigung wenn du live gehst.`
        );
    }

    async handleRemove(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const link = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (!link) {
            return interaction.editReply('❌ Du hast keinen Twitch-Channel verknüpft.');
        }

        // EventSub-Subscription löschen
        await twitchService.unsubscribeFromStreamOnline(link.subscriptionId);

        // Verknüpfung aus Redis entfernen
        await twitchUserService.unlinkUser(interaction.user.id);

        return interaction.editReply(
            `✅ Verknüpfung mit **${link.twitchDisplayName}** wurde entfernt.`
        );
    }

    async handleInfo(interaction: ChatInputCommandInteraction) {
        const link = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (!link) {
            return interaction.reply(
                '❌ Du hast keinen Twitch-Channel verknüpft.\n' +
                'Nutze `/twitch set <channel>` um einen zu hinterlegen.'
            );
        }

        const linkedAt = new Date(link.linkedAt).toLocaleDateString('de-DE');
        return interaction.reply(
            `📺 **Deine Twitch-Verknüpfung**\n\n` +
            `Channel: **${link.twitchDisplayName}**\n` +
            `Twitch-Login: \`${link.twitchLogin}\`\n` +
            `Verknüpft seit: ${linkedAt}`
        );
    }

    async handleNotificationChannel(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel', true);
        await twitchUserService.setNotificationChannel(channel.id);

        return interaction.reply(
            `✅ Twitch-Notifications werden ab jetzt in <#${channel.id}> gepostet.`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `📖 **Twitch-Befehle**\n\n` +
            `**/twitch set** – Deinen Twitch-Channel hinterlegen\n` +
            `**/twitch remove** – Deine Twitch-Verknüpfung entfernen\n` +
            `**/twitch info** – Deine aktuelle Verknüpfung anzeigen\n` +
            `**/twitch notification-channel** – Notification-Channel festlegen (nur Admins)\n` +
            `**/twitch notification-rolle** – Rolle für Notifications festlegen (nur Admins)\n` +
            `**/twitch hilfe** – Zeigt diese Übersicht`
        );
    }

    async handleStreamOnline(twitchUserId: string, event: StreamOnlineEvent) {
        const discordUserId = await twitchUserService.getDiscordIdByTwitchId(twitchUserId);
        if (!discordUserId) return;

        const channelId = await twitchUserService.getNotificationChannel();
        if (!channelId) {
            console.warn('⚠️ Kein Notification-Channel konfiguriert');
            return;
        }

        const channel = await client.channels.fetch(channelId) as TextChannel | null;
        if (!channel) return;

        const storedUser = await userService.getUser(discordUserId);
        const displayName = storedUser?.displayName ?? event.broadcaster_user_name;

        const startedAt = new Date(event.started_at).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const roleId = await twitchUserService.getNotificationRole();
        const roleMention = roleId ? `<@&${roleId}> ` : '';

        await channel.send(
            `${roleMention}🔴 **${displayName}** ist jetzt live auf Twitch!\n` +
            `📺 https://twitch.tv/${event.broadcaster_user_login}\n` +
            `⏰ Live seit ${startedAt} Uhr`
        );
    }

    async handleNotificationRolle(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        const rolle = interaction.options.getRole('rolle', true);
        await twitchUserService.setNotificationRole(rolle.id);

        return interaction.reply(
            `✅ Bei Twitch-Notifications wird ab jetzt <@&${rolle.id}> gepingt.`
        );
    }
}

export default new TwitchHandler();
