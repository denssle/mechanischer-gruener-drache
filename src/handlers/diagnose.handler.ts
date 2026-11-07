import {ChatInputCommandInteraction, Guild, GuildMember, MessageFlags, PermissionFlagsBits, Role} from 'discord.js';
import client from '../client.js';
import twitchUserService from '../services/twitch.user.service.js';
import twitchService from '../services/twitch.service.js';
import sportService from '../services/sport.service.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import geburtstagService from '../services/geburtstag.service.js';
import drachenService from '../services/drachen.service.js';
import rollenhinweisService from '../services/rollenhinweis.service.js';
import {hatEigeneRolle} from '../services/rollen.service.js';
import fehlerMeldungService from '../services/fehlerMeldung.service.js';
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

const MAX_NACHRICHT = 1900;

// Bei vielen Verknüpfungen reißt der Bericht das 2000-Zeichen-Limit. Geteilt wird an Zeilengrenzen und
// nicht gekürzt: die Warnungen stehen oft am Ende, gerade die dürfen nicht wegfallen.
export function teileInNachrichten(zeilen: string[]): string[] {
    const nachrichten: string[] = [];
    let aktuell = '';
    for (const zeile of zeilen) {
        if (aktuell && aktuell.length + zeile.length + 1 > MAX_NACHRICHT) {
            nachrichten.push(aktuell);
            aktuell = zeile;
        } else {
            aktuell = aktuell ? `${aktuell}\n${zeile}` : zeile;
        }
    }
    return [...nachrichten, aktuell];
}

const TAG_MS = 24 * 60 * 60 * 1000;

interface KanalRecht {
    recht: bigint;
    name: string;
}

const KANAL_SEHEN: KanalRecht = {recht: PermissionFlagsBits.ViewChannel, name: 'Kanal sehen'};
const SCHREIBEN: KanalRecht = {recht: PermissionFlagsBits.SendMessages, name: 'Nachrichten senden'};
const VERLAUF: KanalRecht = {recht: PermissionFlagsBits.ReadMessageHistory, name: 'Nachrichtenverlauf lesen'};

function nichtAbrufbar(channelId: string): string {
    return `⚠️ gesetzt (\`${channelId}\`), aber nicht abrufbar (gelöscht oder kein Zugriff?)`;
}

export interface RollenStand {
    gesamt: number;
    ohneRolle: number;
    letzte30Tage: number;
    letztesJahr: number;
    aelter: number;
    hingewiesen: number;
}

// Rein, damit die Aufteilung ohne Discord testbar ist. Bots zählen nicht mit: sie haben oft gar keine
// Rolle und würden die Zahl sonst verfälschen. Ohne Beitrittsdatum (selten) landet jemand bei "älter".
export function zaehleOhneRolle(
    mitglieder: Iterable<GuildMember>,
    hatRolle: (mitglied: GuildMember) => boolean,
    hingewiesen: Set<string>,
    jetzt = Date.now(),
): RollenStand {
    const stand: RollenStand = {gesamt: 0, ohneRolle: 0, letzte30Tage: 0, letztesJahr: 0, aelter: 0, hingewiesen: 0};
    for (const mitglied of mitglieder) {
        if (mitglied.user.bot) continue;
        stand.gesamt++;
        if (hatRolle(mitglied)) continue;

        stand.ohneRolle++;
        if (hingewiesen.has(mitglied.id)) stand.hingewiesen++;
        const tage = (jetzt - (mitglied.joinedTimestamp ?? 0)) / TAG_MS;
        if (tage <= 30) stand.letzte30Tage++;
        else if (tage <= 365) stand.letztesJahr++;
        else stand.aelter++;
    }
    return stand;
}

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
        // Die Antwort ist ein Reply, dafür braucht der Bot auch den Verlauf.
        lines.push(`Rollenhinweis-Kanal: ${await this.pruefeZugang(
            await rollenhinweisService.getChannel(), '❌ nicht gesetzt',
            [KANAL_SEHEN, SCHREIBEN], [KANAL_SEHEN, SCHREIBEN, VERLAUF],
        )}`);
        // Die Button-Nachricht ist alt, ohne Verlauf bliebe der Kanal für Leute ohne Rolle leer.
        lines.push(`Rollenhinweis, Kanal mit dem Rollen-Button: ${await this.pruefeZugang(
            await rollenhinweisService.getRollenKanal(), 'ℹ️ nicht gesetzt (optional)',
            [KANAL_SEHEN, VERLAUF], [KANAL_SEHEN],
        )}`);
        lines.push(`Willkommensgruß: ${await this.pruefeZugang(
            await rollenhinweisService.getWillkommensKanal(), 'ℹ️ nicht gesetzt, Neue werden nicht begrüßt',
            [KANAL_SEHEN, VERLAUF], [KANAL_SEHEN, SCHREIBEN],
        )}`);
        const fehlerKanal = await fehlerMeldungService.getChannel();
        lines.push(`Kanal für Bot-Fehler: ${fehlerKanal ? await this.pruefeKanal(fehlerKanal) : 'ℹ️ nicht gesetzt (optional)'}`);
        lines.push(`Audit-Log-Zugriff: ${this.pruefeAuditLogRecht()}`);

        const event = await eventService.getEvent();
        lines.push(event
            ? `Event: ✅ gesetzt für <t:${Math.floor(event.timestamp / 1000)}:F>`
            : 'Event: ℹ️ kein Event gesetzt (optional)');

        lines.push('\n**Mitglieder ohne Rolle**');
        await this.pruefeMitglieder(lines);

        lines.push('\n**Ping-Pong-Season**');
        await this.pruefeChampionRolle(lines);

        lines.push('\n**Verknüpfte Charaktere**');
        await this.pruefeCharaktere(lines);

        lines.push('\n**Config-Seite (/config)**');
        this.pruefeConfig(lines);

        const [erste, ...rest] = teileInNachrichten(lines);
        await interaction.editReply(erste);
        for (const nachricht of rest) {
            await interaction.followUp({content: nachricht, flags: MessageFlags.Ephemeral});
        }
    }

    // Wer draußen steht und seit wann. Frische Fälle sprechen für ein Problem beim Ankommen, alte eher
    // für verwaiste Konten. Wer zuletzt aktiv war, verrät die Bot-API nicht, das zeigt nur Discords
    // Vorschau "Mitglieder entfernen". Fehlertolerant, siehe pruefeCharaktere.
    private async pruefeMitglieder(lines: string[]): Promise<void> {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        if (!guild) {
            lines.push('⚠️ Server nicht im Cache');
            return;
        }

        try {
            const hauptrolle = await this.ladeHauptrolle(guild, lines);
            const hatRolle = hauptrolle
                ? (mitglied: GuildMember) => mitglied.roles.cache.has(hauptrolle)
                : (mitglied: GuildMember) => hatEigeneRolle(mitglied, guild.id);
            const mitglieder = await guild.members.fetch();
            const hingewiesen = new Set(await rollenhinweisService.getHingewiesene());
            const stand = zaehleOhneRolle(mitglieder.values(), hatRolle, hingewiesen);

            lines.push(`Ohne Rolle: ${stand.ohneRolle} von ${stand.gesamt} (ohne Bots)`);
            lines.push(`Beigetreten: ${stand.letzte30Tage} in den letzten 30 Tagen, ${stand.letztesJahr} im letzten Jahr, ${stand.aelter} früher`);
            lines.push(`Rollenhinweis bekommen: ${stand.hingewiesen}, noch nicht: ${stand.ohneRolle - stand.hingewiesen}`);
        } catch (error) {
            console.error('Konnte die Mitglieder für /diagnose nicht auswerten:', error);
            lines.push('⚠️ Mitglieder konnten nicht ausgewertet werden.');
        }
    }

    // Gesetzt, aber gelöscht: dann zählt wieder "gar keine Rolle", sonst stünde der ganze Server draußen.
    private async ladeHauptrolle(guild: Guild, lines: string[]): Promise<string | null> {
        const rolleId = await rollenhinweisService.getHauptrolle();
        if (!rolleId) {
            lines.push('Hauptrolle: ℹ️ nicht gesetzt (optional), gezählt wird, wer gar keine Rolle hat');
            return null;
        }
        if (!guild.roles.cache.has(rolleId)) {
            lines.push(`Hauptrolle: ⚠️ gesetzt (\`${rolleId}\`), aber nicht (mehr) vorhanden, gezählt wird, wer gar keine Rolle hat`);
            return null;
        }
        lines.push(`Hauptrolle: ✅ <@&${rolleId}>`);
        return rolleId;
    }

    // Hinweis, Gruß und Rollen-Button richten sich an Leute ohne Rolle. Fehlt denen oder dem Bot ein
    // Recht, läuft alles ins Leere, und außer einer Logzeile taucht nirgends ein Fehler auf. Ein
    // einziger Status statt Haken plus Warnung: ein Kanal, der nicht funktioniert, ist nicht grün.
    private async pruefeZugang(
        channelId: string | null,
        leerText: string,
        rechteOhneRolle: KanalRecht[],
        rechteBot: KanalRecht[],
    ): Promise<string> {
        if (!channelId) return leerText;

        const kanal = await client.channels.fetch(channelId).catch(() => null);
        if (!kanal) return nichtAbrufbar(channelId);

        const guild = client.guilds.cache.get(config.GUILD_ID);
        const me = guild?.members.me;
        if (!guild || !me || !('permissionsFor' in kanal)) return `✅ <#${channelId}>`;

        const fehlt = (wer: GuildMember | Role, rechte: KanalRecht[]) => {
            const erlaubt = kanal.permissionsFor(wer);
            return rechte.filter(({recht}) => !erlaubt?.has(recht)).map(({name}) => name);
        };
        const ohneRolle = fehlt(guild.roles.everyone, rechteOhneRolle);
        const bot = fehlt(me, rechteBot);
        const probleme = [
            ...(ohneRolle.length ? [`Leuten ohne Rolle fehlt: ${ohneRolle.join(', ')}`] : []),
            ...(bot.length ? [`mir fehlt: ${bot.join(', ')}`] : []),
        ];
        return probleme.length ? `⚠️ <#${channelId}>, ${probleme.join('; ')}` : `✅ <#${channelId}>`;
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
        return channel ? `✅ <#${channelId}>` : nichtAbrufbar(channelId);
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

        // Seit 2026-11-07 ist jeder Charakter nur einmal verknüpfbar. Was vorher doppelt entstand, bleibt
        // bestehen und gehört von Hand aufgelöst (siehe docs/features/charakter.md).
        const doppelt = new Map<string, number>();
        for (const link of links) {
            const name = findInRoster(roster, link.name)?.name.toLowerCase();
            if (name) doppelt.set(name, (doppelt.get(name) ?? 0) + 1);
        }
        const mehrfach = [...doppelt.values()].filter(anzahl => anzahl > 1).length;
        if (mehrfach > 0) {
            lines.push(`⚠️ ${mehrfach} Charakter(e) sind mehrfach verknüpft – das sollte ein Admin auflösen.`);
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
