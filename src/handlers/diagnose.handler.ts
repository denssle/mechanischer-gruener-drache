import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits} from 'discord.js';
import client from '../client.js';
import twitchUserService from '../services/twitch.user.service.js';
import twitchService from '../services/twitch.service.js';
import sportService from '../services/sport.service.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import eventService from '../services/event.service.js';

// Feature-übergreifende Admin-Diagnose: zeigt auf einen Blick, ob alle setzbaren Kanäle/Einstellungen
// gesetzt UND abrufbar sind, und faltet den früheren Twitch-EventSub-Check mit ein (ersetzt
// `/twitch diagnose`). Die ✅/⚠️/❌-Marker sind hier funktional (Admin-Debugging, dokumentierte
// Emoji-Ausnahme), nicht dekorativ. Bewusst OHNE Testnachricht - reine Lese-Prüfung, kein Kanal-Spam.
class DiagnoseHandler {
    async handleDiagnose(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({flags: MessageFlags.Ephemeral});

        const lines: string[] = ['🔍 **Diagnose**'];

        lines.push('\n**Twitch**');
        lines.push(`Benachrichtigungskanal: ${await this.pruefeKanal(await twitchUserService.getNotificationChannel())}`);
        const roleId = await twitchUserService.getNotificationRole();
        lines.push(roleId ? `Benachrichtigungsrolle: ✅ <@&${roleId}>` : 'Benachrichtigungsrolle: ℹ️ nicht gesetzt (optional)');
        await this.pruefeEventSub(lines);

        lines.push('\n**Weitere Kanäle**');
        lines.push(`Sport-Ankündigungskanal: ${await this.pruefeKanal(await sportService.getAnnouncementChannel())}`);
        lines.push(`Protokoll-Kanal: ${await this.pruefeKanal(await loggingService.getLogChannel())}`);
        lines.push(`Morgengruß-Kanal: ${await this.pruefeKanal(await greetingService.getChannel())}`);

        const event = await eventService.getEvent();
        lines.push(event
            ? `Event: ✅ gesetzt für <t:${Math.floor(event.timestamp / 1000)}:F>`
            : 'Event: ℹ️ kein Event gesetzt (optional)');

        return interaction.editReply(lines.join('\n'));
    }

    // Ein gesetzter Kanal wird gegen Discord gegengeprüft - fängt gelöschte Kanäle / fehlenden Zugriff ab.
    private async pruefeKanal(channelId: string | null): Promise<string> {
        if (!channelId) return '❌ nicht gesetzt';
        const channel = await client.channels.fetch(channelId).catch(() => null);
        return channel
            ? `✅ <#${channelId}>`
            : `⚠️ gesetzt (\`${channelId}\`), aber nicht abrufbar (gelöscht oder kein Zugriff?)`;
    }

    // Twitch-EventSub-Status (übernommen aus dem früheren /twitch diagnose): nur `enabled` stellt zu.
    // Der Netz-Call wird abgesichert, damit ein Twitch-Ausfall den Rest der Diagnose nicht kostet.
    private async pruefeEventSub(lines: string[]): Promise<void> {
        const links = await twitchUserService.getAllLinks();
        lines.push(`Verknüpfte User: ${links.length}`);

        let subscriptions;
        try {
            subscriptions = await twitchService.listStreamOnlineSubscriptions();
        } catch (error) {
            console.error('Fehler beim Abfragen der Twitch-EventSub-Subscriptions:', error);
            lines.push('⚠️ EventSub-Subscriptions konnten nicht abgefragt werden (Twitch nicht erreichbar?).');
            return;
        }

        if (!subscriptions.length) {
            lines.push('❌ Twitch meldet **keine** `stream.online`-Subscriptions – es kann gar keine Live-Meldung ankommen.');
            return;
        }

        const linkByTwitchId = new Map(links.map(link => [link.twitchUserId, link]));
        const byStatus = subscriptions.reduce((acc, s) => {
            acc[s.status] = (acc[s.status] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const statusLine = Object.entries(byStatus).map(([status, count]) => `${count}× \`${status}\``).join(', ');
        lines.push(`EventSub-Subscriptions: ${subscriptions.length} (${statusLine})`);

        for (const sub of subscriptions.slice(0, 25)) {
            const broadcasterId = sub.condition?.broadcaster_user_id;
            const link = broadcasterId ? linkByTwitchId.get(broadcasterId) : undefined;
            const wer = link
                ? `**${link.twitchDisplayName}** (<@${link.discordUserId}>)`
                : `Broadcaster \`${broadcasterId ?? '?'}\` (keine Verknüpfung im Bot)`;
            lines.push(`${sub.status === 'enabled' ? '✅' : '⚠️'} ${wer} – \`${sub.status}\``);
        }
        if (subscriptions.length > 25) {
            lines.push(`… und ${subscriptions.length - 25} weitere.`);
        }

        if ((byStatus['enabled'] ?? 0) < subscriptions.length) {
            lines.push('⚠️ Nicht alle Subscriptions sind `enabled`. Nur `enabled` stellt Live-Meldungen zu – `webhook_callback_verification_pending` bedeutet, dass Twitch den Webhook nie verifizieren konnte (Endpoint nicht erreichbar oder `TWITCH_WEBHOOK_SECRET` falsch). Der betroffene User muss `/twitch entfernen` → `/twitch verknuepfen` neu ausführen.');
        }
    }
}

export default new DiagnoseHandler();
