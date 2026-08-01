import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits} from 'discord.js';
import client from '../client.js';
import twitchUserService from '../services/twitch.user.service.js';
import twitchService from '../services/twitch.service.js';
import sportService from '../services/sport.service.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import geburtstagService from '../services/geburtstag.service.js';
import drachenService from '../services/drachen.service.js';
import eventService from '../services/event.service.js';
import characterService, {CharacterLink, findInRoster} from '../services/character.service.js';
import pingPongService from '../services/pingPong.service.js';
import {formatMonat} from './pingPongSeason.handler.js';
import {oauthConfigured} from '../services/discordOAuth.service.js';
import {sessionConfigured} from '../server/config.session.js';
import config from '../../config.json' with {type: 'json'};

// Adresse der Verwaltungsseite. Optionales Config-Feld per Cast (Muster twitch.service.ts), Default
// wie in config.router.ts.
const CONFIG_URL = `${(config as {CONFIG_BASE_URL?: string}).CONFIG_BASE_URL ?? 'http://localhost:3000'}/config`;

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
        lines.push(`Geburtstagskanal: ${await this.pruefeKanal(await geburtstagService.getChannel())}`);
        lines.push(`Spielwelt-Ankündigungskanal: ${await this.pruefeKanal(await drachenService.getChannel())}`);
        lines.push(`Audit-Log-Zugriff: ${this.pruefeAuditLogRecht()}`);

        const event = await eventService.getEvent();
        lines.push(event
            ? `Event: ✅ gesetzt für <t:${Math.floor(event.timestamp / 1000)}:F>`
            : 'Event: ℹ️ kein Event gesetzt (optional)');

        lines.push('\n**Ping-Pong-Season**');
        await this.pruefeChampionRolle(lines);

        lines.push('\n**Verknüpfte Charaktere**');
        await this.pruefeCharaktere(lines);

        lines.push('\n**Config-Seite (/config)**');
        this.pruefeConfig(lines);

        return interaction.editReply(lines.join('\n'));
    }

    // Ist der /config-Login scharf geschaltet? Reines Config-Lesen (kein Netz): ohne beide Secrets
    // bleibt die Seite fail-closed (503) - die häufigste "warum geht /config nicht"-Ursache. Die
    // externe Erreichbarkeit (nginx/Backend-Mapping) wird bewusst NICHT geprüft - dafür bräuchte es
    // einen Selbst-HTTP-Request; das deckt der Deploy-curl (/twitch/eventsub → 404) ohnehin ab.
    private pruefeConfig(lines: string[]): void {
        const login = oauthConfigured();
        const session = sessionConfigured();
        if (login && session) {
            // Nennt die URL: sie steht sonst NIRGENDS im Bot (die Seite hat bewusst keinen eigenen
            // Command), Admins mussten sie auswendig kennen. /diagnose ist der natürliche Ort dafür.
            lines.push(`✅ Login konfiguriert – ${CONFIG_URL} (sofern das Web-Backend-Mapping steht).`);
            return;
        }
        const fehlt = [!login && 'DISCORD_CLIENT_SECRET', !session && 'CONFIG_SESSION_SECRET']
            .filter(Boolean).join(' + ');
        lines.push(`❌ Login NICHT konfiguriert (${fehlt} fehlt) – /config bleibt gesperrt (503).`);
    }

    // Ohne "Audit-Log ansehen" nennt das Protokoll keine Urheber mehr (Rollen/Bans/Timeouts), meldet
    // Kicks als gewöhnliches Verlassen und protokolliert Rollen-/Kanal-/Webhook-Änderungen gar nicht -
    // alles still, ohne Fehlermeldung. Genau deshalb steht es hier.
    private pruefeAuditLogRecht(): string {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        if (!guild) return '⚠️ Server nicht im Cache';

        return guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)
            ? '✅ vorhanden'
            : '⚠️ Recht "Audit-Log ansehen" fehlt – Protokoll nennt keine Urheber, Kicks sehen aus wie Austritte';
    }

    // Die Champion-Rolle der Ping-Pong-Season wird am Monatswechsel automatisch weitergereicht -
    // scheitert das, wird es NUR geloggt und die Season trotzdem abgerechnet (die Abrechnung darf
    // nicht an einer Rolle hängen). Im Discord sieht man davon nichts, deshalb stehen hier alle
    // drei Voraussetzungen: Rolle vorhanden, Recht "Rollen verwalten", Bot-Rolle über der Rolle.
    private async pruefeChampionRolle(lines: string[]): Promise<void> {
        const abgerechnet = await pingPongService.getLastSeason();
        lines.push(abgerechnet
            ? `Zuletzt abgerechnet: ✅ ${formatMonat(abgerechnet)}`
            : 'Zuletzt abgerechnet: ⚠️ noch nie (Marker wird beim nächsten Start gesetzt)');

        const rolleId = await pingPongService.getChampionRole();
        if (!rolleId) {
            lines.push('Champion-Rolle: ❌ nicht gesetzt – der Monatssieger bekommt keine Auszeichnung (nur den Ruhmeshallen-Eintrag). Setzbar auf /config.');
            return;
        }

        const guild = client.guilds.cache.get(config.GUILD_ID);
        const rolle = guild?.roles.cache.get(rolleId);
        if (!guild || !rolle) {
            lines.push(`Champion-Rolle: ⚠️ gesetzt (\`${rolleId}\`), aber nicht (mehr) vorhanden`);
            return;
        }
        lines.push(`Champion-Rolle: ✅ <@&${rolleId}>`);

        const me = guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            lines.push('⚠️ Mir fehlt das Recht "Rollen verwalten" – ich kann die Champion-Rolle nicht vergeben.');
            return;
        }
        if (me.roles.highest.comparePositionTo(rolle) <= 0) {
            lines.push('⚠️ Die Champion-Rolle steht über meiner Rolle in der Hierarchie – ich kann sie nicht vergeben.');
        }
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

    // Verknüpfte LotGD-Charaktere: pro Verknüpfung prüfen, ob der Name noch im aktuellen Roster steht
    // (findInRoster matcht den Kern-Namen suffix-auf-Wortgrenze, s. Titel-Präfix-Falle). Ein
    // fehlender Treffer ist ein verwaister Link (Charakter umbenannt/gelöscht). Fehlertolerant:
    // ein Redis-Problem bei den Links bzw. ein nicht abrufbares Roster kostet nicht den Rest.
    private async pruefeCharaktere(lines: string[]): Promise<void> {
        let links: CharacterLink[];
        try {
            links = await characterService.getAllLinks();
        } catch (error) {
            console.error('Konnte die Charakter-Verknüpfungen für /diagnose nicht laden:', error);
            lines.push('⚠️ Verknüpfungen konnten nicht geladen werden.');
            return;
        }

        lines.push(`Anzahl: ${links.length}`);
        if (links.length === 0) return;

        const roster = await characterService.getRoster();
        if (!roster) {
            lines.push('⚠️ Roster nicht abrufbar – Verknüpfungen konnten nicht gegen die Kriegerliste geprüft werden.');
            return;
        }

        let verwaist = 0;
        for (const link of links.slice(0, 25)) {
            const entry = findInRoster(roster, link.name);
            if (entry) {
                lines.push(`✅ **${link.name}** (<@${link.discordUserId}>) – im Roster als „${entry.name}"`);
            } else {
                lines.push(`⚠️ **${link.name}** (<@${link.discordUserId}>) – nicht (mehr) im Roster gefunden`);
                verwaist++;
            }
        }
        if (links.length > 25) {
            lines.push(`… und ${links.length - 25} weitere.`);
        }

        if (verwaist > 0) {
            lines.push(`⚠️ ${verwaist} Verknüpfung(en) ohne Roster-Treffer – der Charakter wurde evtl. umbenannt oder gelöscht (betroffene User: \`/charakter entfernen\` und neu verknüpfen).`);
        }
    }
}

export default new DiagnoseHandler();
