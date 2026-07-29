import {AuditLogEvent, Guild, GuildAuditLogsEntry, GuildBan, GuildMember, GuildTextBasedChannel, Message, PartialGuildMember, PartialMessage, PermissionsBitField, ReadonlyCollection, TextChannel} from 'discord.js';
import client from '../client.js';
import loggingService, {CachedMessage} from '../services/logging.service.js';
import memberService from '../services/member.service.js';

// Anhänge werden nur mit Dateinamen protokolliert (die CDN-Links funktionieren nach dem Löschen
// ohnehin nicht mehr, und die Dateien selbst spiegeln wir bewusst nicht).
function formatAttachments(attachments: string[]): string {
    return attachments.length ? `\nAnhänge: ${attachments.join(', ')}` : '';
}

// Discord lehnt Nachrichten über 2000 Zeichen mit Fehler 50035 ("Invalid Form Body") ab. Log-Posts
// aus dynamischem Inhalt (v.a. eine gelöschte/bearbeitete lange Nachricht) können das überschreiten;
// dann wird der Post zwar vom try/catch gefangen, aber der Log-Eintrag geht verloren. Deshalb hier
// kürzen, statt scheitern zu lassen.
export const DISCORD_MAX_LENGTH = 2000;
const GEKUERZT_SUFFIX = '… [gekürzt]';

export function kuerzeFuerDiscord(text: string): string {
    if (text.length <= DISCORD_MAX_LENGTH) {
        return text;
    }
    return text.slice(0, DISCORD_MAX_LENGTH - GEKUERZT_SUFFIX.length) + GEKUERZT_SUFFIX;
}

// Wie lange jemand auf dem Server war. Bewusst grob: Monate sind mit 30 Tagen gerechnet,
// Jahre mit 365 - für "war zwei Jahre dabei" reicht das, und niemand zählt hier Schaltjahre
// nach. Gezeigt werden nur die zwei größten Einheiten (wie bei formatRemaining im Event).
const TAG_MS = 86400000;

export function formatMitgliedsdauer(dauerMs: number): string {
    const tageGesamt = Math.floor(dauerMs / TAG_MS);
    if (tageGesamt < 1) return 'weniger als einen Tag';

    const jahre = Math.floor(tageGesamt / 365);
    const monate = Math.floor((tageGesamt % 365) / 30);
    const tage = (tageGesamt % 365) % 30;

    const parts: string[] = [];
    if (jahre > 0) parts.push(`${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'}`);
    if (monate > 0) parts.push(`${monate} ${monate === 1 ? 'Monat' : 'Monate'}`);
    // Tage nur, solange es nicht schon um Jahre geht - sonst unnötig genau.
    if (tage > 0 && jahre === 0) parts.push(`${tage} ${tage === 1 ? 'Tag' : 'Tage'}`);

    if (parts.length === 0) return 'weniger als einen Tag';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1];
}

// Das Audit-Log ist die einzige Quelle dafür, WER eine Aktion ausgeführt hat: die Gateway-Events
// (GuildMemberUpdate, GuildBanAdd, …) nennen nur das Ziel. Wir fragen es deshalb bei den
// betroffenen Meldungen nach und reichern sie an - statt jede Aktion ein zweites Mal zu loggen.
//
// Zwei bewusste Kompromisse:
// 1. KEIN Warten auf den Audit-Eintrag. Discord schreibt ihn üblicherweise vor dem Gateway-Event,
//    garantiert ist das aber nicht. Kommt er zu spät, fehlt in der Meldung der Urheber (bei einem
//    Kick steht dann "hat den Server verlassen") - also schlimmstenfalls der Stand von vorher.
// 2. Das Zeitfenster verhindert, dass ein alter Eintrag einer frischen Aktion zugeschrieben wird
//    (z.B. "gekickt", weil dieselbe Person vor drei Wochen schon mal gekickt wurde).
export const AUDIT_MAX_ALTER_MS = 10000;

export interface AuditInfo {
    ausfuehrerTag: string | null;
    grund: string | null;
}

// Hängt " durch **Name** (Grund: …)" an, soweit bekannt. Ohne Audit-Log-Zugriff bleibt es leer,
// die Meldung selbst geht trotzdem raus.
export function formatAusfuehrer(info: AuditInfo | null): string {
    if (!info) return '';
    const durch = info.ausfuehrerTag ? ` durch **${info.ausfuehrerTag}**` : '';
    const grund = info.grund ? ` (Grund: ${info.grund})` : '';
    return durch + grund;
}

// Beschreibt eine Änderung an den Berechtigungen einer Rolle. Genau das ist der sicherheits-
// relevante Fall: wer einer harmlosen Rolle still "Administrator" gibt, sieht man sonst nirgends.
export function formatRechteAenderung(alt: string | null, neu: string | null): string | null {
    if (alt === null || neu === null) return null;

    const alteRechte = new PermissionsBitField(BigInt(alt)).toArray();
    const neueRechte = new PermissionsBitField(BigInt(neu)).toArray();
    const dazu = neueRechte.filter(recht => !alteRechte.includes(recht));
    const weg = alteRechte.filter(recht => !neueRechte.includes(recht));

    const teile: string[] = [];
    if (dazu.length) teile.push(`**+** ${dazu.join(', ')}`);
    if (weg.length) teile.push(`**−** ${weg.join(', ')}`);
    return teile.length ? teile.join(' | ') : null;
}

// Bei gelöschten Objekten ist `target` oft schon weg - dann steht der Name noch in den Changes.
function nameAusEintrag(entry: GuildAuditLogsEntry): string {
    const target = entry.target as {name?: string} | null;
    if (target?.name) return target.name;

    const change = entry.changes.find(eintrag => eintrag.key === 'name');
    const wert = change?.new ?? change?.old;
    return typeof wert === 'string' ? wert : 'unbekannt';
}

function changeWert(entry: GuildAuditLogsEntry, key: string, feld: 'old' | 'new'): string | null {
    const wert = entry.changes.find(eintrag => eintrag.key === key)?.[feld];
    return typeof wert === 'string' ? wert : null;
}

// Änderungen an der Server-STRUKTUR (Rollen, Kanäle, Webhooks). Die haben keine eigenen
// Gateway-Events, die den Urheber kennen - hier ist der Audit-Eintrag die einzige Quelle,
// es kann also nichts doppelt geloggt werden. Bewusst eine Whitelist: alles andere im
// Audit-Log (Nachrichten, Bans, Rollenvergabe an Personen) wird schon anderswo geloggt
// oder wäre Rauschen.
export function beschreibeAuditEintrag(entry: GuildAuditLogsEntry): string | null {
    const wer = entry.executor ? ` durch **${entry.executor.tag}**` : '';
    const grund = entry.reason ? ` (Grund: ${entry.reason})` : '';
    const name = nameAusEintrag(entry);

    switch (entry.action) {
        case AuditLogEvent.RoleCreate:
            return `➕ Rolle **${name}** wurde erstellt${wer}.${grund}`;
        case AuditLogEvent.RoleDelete:
            return `🗑️ Rolle **${name}** wurde gelöscht${wer}.${grund}`;
        case AuditLogEvent.RoleUpdate: {
            const rechte = formatRechteAenderung(changeWert(entry, 'permissions', 'old'), changeWert(entry, 'permissions', 'new'));
            if (rechte) return `🔐 Rechte der Rolle **${name}** geändert${wer}: ${rechte}${grund}`;

            const alterName = changeWert(entry, 'name', 'old');
            const neuerName = changeWert(entry, 'name', 'new');
            if (alterName && neuerName) return `🏷️ Rolle **${alterName}** wurde in **${neuerName}** umbenannt${wer}.${grund}`;

            // Farbe, Position, Icon: kein Sicherheitsbelang, dafür schnell viel Rauschen.
            return null;
        }
        case AuditLogEvent.ChannelCreate:
            return `➕ Kanal **${name}** wurde erstellt${wer}.${grund}`;
        case AuditLogEvent.ChannelDelete:
            return `🗑️ Kanal **${name}** wurde gelöscht${wer}.${grund}`;
        case AuditLogEvent.WebhookCreate:
            return `🪝 Webhook **${name}** wurde erstellt${wer}.${grund}`;
        case AuditLogEvent.WebhookDelete:
            return `🪝 Webhook **${name}** wurde gelöscht${wer}.${grund}`;
        default:
            return null;
    }
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

            await this.sendeLog(logChannel,
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

            await this.sendeLog(logChannel,
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
            // Bewusst VOR dem Channel-Check: gezählt wird auch dann, wenn (noch) kein
            // Log-Channel konfiguriert ist - sonst würde die Zahl später falsch dastehen.
            const anzahl = await memberService.zaehleBeitritt(member.id);

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            // Beim ersten Mal ist die Zahl keine Information - erst ein Wiederkommen ist eine.
            const zusatz = anzahl > 1 ? ` (bereits zum ${anzahl}. Mal)` : '';
            await this.sendeLog(logChannel,`📥 **${member.user.tag}** ist dem Server beigetreten${zusatz}.`);
        } catch (error) {
            console.error('Fehler beim Loggen des Server-Beitritts:', error);
        }
    }

    async handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            // Ein Bann löst AUCH dieses Event aus. handleGuildBanAdd loggt den Fall schon
            // (inkl. Urheber), hier also nichts posten - sonst stünde beides untereinander.
            const bann = await this.holeAuditInfo(member.guild, AuditLogEvent.MemberBanAdd, member.id);
            if (bann) return;

            // joinedTimestamp fehlt, wenn das Mitglied nicht (mehr) gecacht ist - dann bleibt
            // die Dauer einfach weg, statt eine erfundene Zahl zu nennen.
            const dauer = member.joinedTimestamp
                ? ` – war ${formatMitgliedsdauer(Date.now() - member.joinedTimestamp)} dabei`
                : '';

            // Gekickt oder von selbst gegangen? Das Event sieht in beiden Fällen gleich aus,
            // nur das Audit-Log kennt den Unterschied (und den Urheber).
            const kick = await this.holeAuditInfo(member.guild, AuditLogEvent.MemberKick, member.id);
            if (kick) {
                await this.sendeLog(logChannel,`👢 **${member.user.tag}** wurde gekickt${formatAusfuehrer(kick)}${dauer}.`);
                return;
            }

            await this.sendeLog(logChannel,`📤 **${member.user.tag}** hat den Server verlassen${dauer}.`);
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
            // Getrennt gesammelt, weil der Urheber je Kategorie aus einem anderen Audit-Log-Typ
            // kommt (Rollenvergabe vs. Nickname/Timeout). Die Meldungen tragen deshalb keinen
            // Schlusspunkt - der kommt erst hinter dem Urheber.
            const rollenMeldungen: string[] = [];
            const mitgliedsMeldungen: string[] = [];

            // Rollen
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;
            for (const role of newRoles.filter(role => !oldRoles.has(role.id)).values()) {
                rollenMeldungen.push(`➕ **${tag}** hat die Rolle **${role.name}** erhalten`);
            }
            for (const role of oldRoles.filter(role => !newRoles.has(role.id)).values()) {
                rollenMeldungen.push(`➖ **${tag}** hat die Rolle **${role.name}** verloren`);
            }

            // Nickname
            if (oldMember.nickname !== newMember.nickname) {
                if (!newMember.nickname) {
                    mitgliedsMeldungen.push(`🏷️ **${tag}** hat den Nickname **${oldMember.nickname}** entfernt`);
                } else if (!oldMember.nickname) {
                    mitgliedsMeldungen.push(`🏷️ **${tag}** hat sich den Nickname **${newMember.nickname}** gegeben`);
                } else {
                    mitgliedsMeldungen.push(`🏷️ **${tag}** hat den Nickname von **${oldMember.nickname}** zu **${newMember.nickname}** geändert`);
                }
            }

            // Timeout / Mute
            const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
            const newTimeout = newMember.communicationDisabledUntilTimestamp;
            if (oldTimeout !== newTimeout) {
                if (newTimeout && newTimeout > Date.now()) {
                    mitgliedsMeldungen.push(`🔇 **${tag}** wurde bis <t:${Math.floor(newTimeout / 1000)}:f> stummgeschaltet (Timeout)`);
                } else if (oldTimeout && oldTimeout > Date.now()) {
                    mitgliedsMeldungen.push(`🔊 Der Timeout von **${tag}** wurde aufgehoben`);
                }
            }

            if (!rollenMeldungen.length && !mitgliedsMeldungen.length) return;

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            // Nur abfragen, was auch gebraucht wird - jede Abfrage ist ein API-Call.
            const rollenInfo = rollenMeldungen.length
                ? await this.holeAuditInfo(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id)
                : null;
            const mitgliedsInfo = mitgliedsMeldungen.length
                ? await this.holeAuditInfo(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id)
                : null;

            for (const [meldungen, info] of [[rollenMeldungen, rollenInfo], [mitgliedsMeldungen, mitgliedsInfo]] as const) {
                // "hat sich den Nickname gegeben durch **sich selbst**" wäre albern.
                const zusatz = info?.ausfuehrerTag === tag ? formatAusfuehrer({...info, ausfuehrerTag: null}) : formatAusfuehrer(info);
                for (const meldung of meldungen) {
                    await this.sendeLog(logChannel, `${meldung}${zusatz}.`);
                }
            }
        } catch (error) {
            console.error('Fehler beim Loggen der Mitglieds-Änderung:', error);
        }
    }

    async handleGuildBanAdd(ban: GuildBan) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            // ban.reason kennt den Grund, aber nicht den Urheber - der steht nur im Audit-Log.
            // Ist es nicht abrufbar, bleibt wenigstens der Grund erhalten (der Stand von vorher).
            const info = await this.holeAuditInfo(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
            const zusatz = formatAusfuehrer({
                ausfuehrerTag: info?.ausfuehrerTag ?? null,
                grund: info?.grund ?? ban.reason ?? null,
            });
            await this.sendeLog(logChannel,`🔨 **${ban.user.tag}** wurde gebannt${zusatz}.`);
        } catch (error) {
            console.error('Fehler beim Loggen des Banns:', error);
        }
    }

    async handleGuildBanRemove(ban: GuildBan) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            const info = await this.holeAuditInfo(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
            await this.sendeLog(logChannel,`♻️ Der Bann von **${ban.user.tag}** wurde aufgehoben${formatAusfuehrer(info)}.`);
        } catch (error) {
            console.error('Fehler beim Loggen der Bann-Aufhebung:', error);
        }
    }

    async handleMessageBulkDelete(messages: ReadonlyCollection<string, Message | PartialMessage>, channel: GuildTextBasedChannel) {
        try {
            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            await this.sendeLog(logChannel,`🧹 **${messages.size}** Nachrichten wurden in <#${channel.id}> gelöscht (Massen-Löschung).`);
        } catch (error) {
            console.error('Fehler beim Loggen der Massen-Löschung:', error);
        }
    }

    // Holt den jüngsten passenden Audit-Eintrag zu einer gerade passierten Aktion.
    // Fehlertolerant: fehlt dem Bot das Recht "Audit-Log ansehen", wirft fetchAuditLogs -
    // dann gibt es die Meldung eben ohne Urheber, statt sie ganz zu verlieren.
    private async holeAuditInfo(guild: Guild | null, typ: AuditLogEvent, zielId: string): Promise<AuditInfo | null> {
        if (!guild) return null;

        try {
            const logs = await guild.fetchAuditLogs({type: typ, limit: 5});
            const eintrag = logs.entries.find(eintrag =>
                eintrag.targetId === zielId && Date.now() - eintrag.createdTimestamp < AUDIT_MAX_ALTER_MS
            );
            if (!eintrag) return null;

            return {ausfuehrerTag: eintrag.executor?.tag ?? null, grund: eintrag.reason};
        } catch (error) {
            console.warn('Audit-Log nicht abrufbar (fehlt dem Bot das Recht "Audit-Log ansehen"?):', error);
            return null;
        }
    }

    // Änderungen an Rollen, Kanälen und Webhooks - siehe beschreibeAuditEintrag.
    async handleAuditLogEntry(entry: GuildAuditLogsEntry, _guild: Guild) {
        try {
            const meldung = beschreibeAuditEintrag(entry);
            if (!meldung) return;

            const logChannel = await this.getLogChannel();
            if (!logChannel) return;

            await this.sendeLog(logChannel, meldung);
        } catch (error) {
            console.error('Fehler beim Loggen des Audit-Log-Eintrags:', error);
        }
    }

    private async getLogChannel(): Promise<TextChannel | null> {
        const channelId = await loggingService.getLogChannel();
        if (!channelId) return null;

        return await client.channels.fetch(channelId) as TextChannel | null;
    }

    // Zentraler Weg, einen Log-Eintrag zu posten: kürzt auf das Discord-2000-Zeichen-Limit,
    // damit ein langer Inhalt den Post nicht mit Fehler 50035 scheitern lässt.
    private async sendeLog(logChannel: TextChannel, inhalt: string): Promise<void> {
        await logChannel.send(kuerzeFuerDiscord(inhalt));
    }
}

const loggingHandler = new LoggingHandler();

export default loggingHandler;
