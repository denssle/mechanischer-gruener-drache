import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextChannel} from "discord.js";
import twitchUserService from "../services/twitch.user.service.js";
import twitchService from "../services/twitch.service.js";
import {StreamOnlineEvent} from "../types/streamOnlineEvent.js";
import client from "../client.js";
import userService from "../services/user.service.js";

class TwitchHandler {
    async handleVerknuepfen(interaction: ChatInputCommandInteraction) {
        const twitchLogin = interaction.options.getString('benutzername', true).toLowerCase();

        await interaction.deferReply();

        // Prüfen ob User schon eine Verknüpfung hat
        const existingLink = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (existingLink) {
            return interaction.editReply(
                `Du hast bereits **${existingLink.twitchDisplayName}** verknüpft. ` +
                `Nutze \`/twitch entfernen\` um die Verknüpfung zuerst zu entfernen.`
            );
        }

        // Twitch User suchen
        const twitchUser = await twitchService.getUserByLogin(twitchLogin);
        if (!twitchUser) {
            return interaction.editReply(`Twitch-Channel **${twitchLogin}** nicht gefunden.`);
        }

        // EventSub-Subscription registrieren
        const subscriptionId = await twitchService.subscribeToStreamOnline(twitchUser.id);
        if (!subscriptionId) {
            return interaction.editReply('Fehler beim Registrieren der Twitch-Benachrichtigung.');
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
            `Twitch-Channel **${twitchUser.display_name}** erfolgreich verknüpft!\n` +
            `Der Server wird ab jetzt benachrichtigt, wenn du live gehst.`
        );
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const link = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (!link) {
            return interaction.editReply('Du hast keinen Twitch-Channel verknüpft.');
        }

        // EventSub-Subscription löschen
        const unsubscribed = await twitchService.unsubscribeFromStreamOnline(link.subscriptionId);
        if (!unsubscribed) {
            return interaction.editReply('Fehler beim Entfernen der Twitch-Benachrichtigung. Versuch es später nochmal.');
        }

        // Verknüpfung aus Redis entfernen
        await twitchUserService.unlinkUser(interaction.user.id);

        return interaction.editReply(
            `Verknüpfung mit **${link.twitchDisplayName}** wurde entfernt.`
        );
    }

    async handleStatus(interaction: ChatInputCommandInteraction) {
        const link = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (!link) {
            return interaction.reply(
                'Du hast keinen Twitch-Kanal verknüpft.\n' +
                'Nutze `/twitch verknuepfen <benutzername>` um einen zu hinterlegen.'
            );
        }

        const linkedAt = new Date(link.linkedAt).toLocaleDateString('de-DE');
        return interaction.reply(
            `**Deine Twitch-Verknüpfung**\n\n` +
            `Channel: **${link.twitchDisplayName}**\n` +
            `Twitch-Login: \`${link.twitchLogin}\`\n` +
            `Verknüpft seit: ${linkedAt}`
        );
    }

    async handleBenachrichtigungskanal(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('kanal', true);
        await twitchUserService.setNotificationChannel(channel.id);

        return interaction.reply(
            `Twitch-Notifications werden ab jetzt in <#${channel.id}> gepostet.`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Twitch-Befehle**\n\n` +
            `**/twitch verknuepfen** – Deinen Twitch-Kanal hinterlegen\n` +
            `**/twitch entfernen** – Deine Twitch-Verknüpfung entfernen\n` +
            `**/twitch status** – Deine aktuelle Verknüpfung anzeigen\n` +
            `**/twitch hilfe** – Zeigt diese Übersicht`
        );
    }

    async handleStreamOnline(twitchUserId: string, event: StreamOnlineEvent) {
        const discordUserId = await twitchUserService.getDiscordIdByTwitchId(twitchUserId);
        if (!discordUserId) {
            console.warn(`⚠️ Twitch-Live-Event für unbekannten Broadcaster ${twitchUserId} (${event.broadcaster_user_login}) - keine Verknüpfung gefunden, ignoriere.`);
            return;
        }

        const channelId = await twitchUserService.getNotificationChannel();
        if (!channelId) {
            console.warn('⚠️ Kein Notification-Channel konfiguriert - Live-Meldung wird verworfen.');
            return;
        }

        const channel = await client.channels.fetch(channelId) as TextChannel | null;
        if (!channel) {
            console.warn(`⚠️ Notification-Channel ${channelId} konnte nicht abgerufen werden - Live-Meldung wird verworfen.`);
            return;
        }

        const storedUser = await userService.getUser(discordUserId);
        const displayName = storedUser?.displayName ?? event.broadcaster_user_name;

        const startedAt = new Date(event.started_at).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const roleId = await twitchUserService.getNotificationRole();
        const roleMention = roleId ? `<@&${roleId}> ` : '';

        // Spiel/Kategorie + Titel sind eine Anreicherung: kommt nichts zurück (Abruf-Fehler
        // oder direkt beim Live-Gehen noch nicht verfügbar), fallen die Zeilen einfach weg.
        const streamInfo = await twitchService.getStreamInfo(twitchUserId);

        const lines = [`${roleMention}**${displayName}** ist jetzt live auf Twitch!`];
        if (streamInfo?.title) {
            lines.push(streamInfo.title);
        }
        if (streamInfo?.game_name) {
            lines.push(streamInfo.game_name);
        }
        lines.push(`https://twitch.tv/${event.broadcaster_user_login}`);
        lines.push(`Live seit ${startedAt} Uhr`);

        await channel.send(lines.join('\n'));
    }

    async handleSubscriptionRevoked(subscriptionId: string, reason: string) {
        const discordUserId = await twitchUserService.getDiscordIdBySubscriptionId(subscriptionId);
        if (!discordUserId) return;

        console.warn(`⚠️ Twitch-Subscription ${subscriptionId} widerrufen (${reason}) - entferne Verknüpfung für Discord-User ${discordUserId}`);
        await twitchUserService.unlinkUser(discordUserId);
    }

    async handleBenachrichtigungsrolle(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const rolle = interaction.options.getRole('rolle', true);
        await twitchUserService.setNotificationRole(rolle.id);

        return interaction.reply(
            `Bei Twitch-Notifications wird ab jetzt <@&${rolle.id}> gepingt.`
        );
    }
}

export default new TwitchHandler();
