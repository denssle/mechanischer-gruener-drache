import {ChatInputCommandInteraction, PermissionFlagsBits, TextChannel} from "discord.js";
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

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const link = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (!link) {
            return interaction.editReply('❌ Du hast keinen Twitch-Channel verknüpft.');
        }

        // EventSub-Subscription löschen
        const unsubscribed = await twitchService.unsubscribeFromStreamOnline(link.subscriptionId);
        if (!unsubscribed) {
            return interaction.editReply('❌ Fehler beim Entfernen der Twitch-Benachrichtigung. Versuch es später nochmal.');
        }

        // Verknüpfung aus Redis entfernen
        await twitchUserService.unlinkUser(interaction.user.id);

        return interaction.editReply(
            `✅ Verknüpfung mit **${link.twitchDisplayName}** wurde entfernt.`
        );
    }

    async handleStatus(interaction: ChatInputCommandInteraction) {
        const link = await twitchUserService.getLinkByDiscordId(interaction.user.id);
        if (!link) {
            return interaction.reply(
                '❌ Du hast keinen Twitch-Kanal verknüpft.\n' +
                'Nutze `/twitch verknuepfen <benutzername>` um einen zu hinterlegen.'
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

    async handleBenachrichtigungskanal(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('kanal', true);
        await twitchUserService.setNotificationChannel(channel.id);

        return interaction.reply(
            `✅ Twitch-Notifications werden ab jetzt in <#${channel.id}> gepostet.`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `📖 **Twitch-Befehle**\n\n` +
            `**/twitch verknuepfen** – Deinen Twitch-Kanal hinterlegen\n` +
            `**/twitch entfernen** – Deine Twitch-Verknüpfung entfernen\n` +
            `**/twitch status** – Deine aktuelle Verknüpfung anzeigen\n` +
            `**/twitch benachrichtigungskanal** – Benachrichtigungs-Kanal festlegen (nur Admins)\n` +
            `**/twitch benachrichtigungsrolle** – Rolle für Benachrichtigungen festlegen (nur Admins)\n` +
            `**/twitch diagnose** – Kanal, Rolle & Subscriptions prüfen + Testnachricht (nur Admins)\n` +
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

        await channel.send(
            `${roleMention}🔴 **${displayName}** ist jetzt live auf Twitch!\n` +
            `📺 https://twitch.tv/${event.broadcaster_user_login}\n` +
            `⏰ Live seit ${startedAt} Uhr`
        );
    }

    async handleDiagnose(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const lines: string[] = ['🔍 **Twitch-Diagnose**\n'];

        // Benachrichtigungskanal prüfen und auflösen
        const channelId = await twitchUserService.getNotificationChannel();
        let channel: TextChannel | null = null;
        if (!channelId) {
            lines.push('❌ Kein Benachrichtigungskanal gesetzt – nutze `/twitch benachrichtigungskanal`.');
        } else {
            try {
                channel = await client.channels.fetch(channelId) as TextChannel | null;
            } catch {
                channel = null;
            }
            lines.push(channel
                ? `✅ Benachrichtigungskanal: <#${channelId}>`
                : `⚠️ Benachrichtigungskanal gesetzt (\`${channelId}\`), aber nicht abrufbar (gelöscht oder kein Zugriff?).`);
        }

        // Rolle prüfen (optional)
        const roleId = await twitchUserService.getNotificationRole();
        lines.push(roleId
            ? `✅ Benachrichtigungsrolle: <@&${roleId}>`
            : 'ℹ️ Keine Benachrichtigungsrolle gesetzt (optional).');

        // EventSub-Subscriptions bei Twitch abfragen
        const links = await twitchUserService.getAllLinks();
        const subscriptions = await twitchService.listStreamOnlineSubscriptions();
        lines.push(`\n**Verknüpfte User:** ${links.length}`);
        if (!subscriptions.length) {
            lines.push('❌ Twitch meldet **keine** `stream.online`-Subscriptions – es kann gar keine Live-Meldung ankommen.');
        } else {
            const byStatus = subscriptions.reduce((acc, s) => {
                acc[s.status] = (acc[s.status] ?? 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const statusLine = Object.entries(byStatus).map(([status, count]) => `${count}× \`${status}\``).join(', ');
            lines.push(`**EventSub-Subscriptions:** ${subscriptions.length} (${statusLine})`);
            if ((byStatus['enabled'] ?? 0) < subscriptions.length) {
                lines.push('⚠️ Nicht alle Subscriptions sind `enabled`. Nur `enabled` stellt Live-Meldungen zu – `webhook_callback_verification_pending` bedeutet, dass Twitch den Webhook nie verifizieren konnte (Endpoint nicht erreichbar oder `TWITCH_WEBHOOK_SECRET` falsch).');
            }
        }

        // End-to-End: Testnachricht in den Kanal posten
        if (channel) {
            try {
                await channel.send('🔔 **Test:** Twitch-Live-Benachrichtigungen landen in diesem Kanal. (ausgelöst durch `/twitch diagnose`)');
                lines.push('\n✅ Testnachricht in den Kanal gepostet.');
            } catch (error) {
                console.error('Fehler beim Senden der Twitch-Diagnose-Testnachricht:', error);
                lines.push('\n❌ Testnachricht konnte **nicht** gepostet werden – dem Bot fehlen vermutlich die Schreibrechte in dem Kanal.');
            }
        }

        return interaction.editReply(lines.join('\n'));
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
