import {
    ChatInputCommandInteraction,
    Message,
    MessageFlags,
    OmitPartialGroupDMChannel,
    PermissionFlagsBits,
    TextBasedChannel,
} from 'discord.js';
import client from '../client.js';
import greetingService from '../services/greeting.service.js';

// Morgengruß-Tradition: die erste Nachricht des Tages im Morgengruß-Kanal wird nur per Reaktion
// begrüßt (kein eigener Post - passt zum Blåhaj-/Sport-Auto-Listener-Muster). Die Emojis sind hier
// funktional (die einzige Rückmeldung), nicht dekorativ - bewusste Ausnahme zur Emoji-Sparsamkeit.
export const WELLE = '👋';

// Fallback-Pool: persönliches Emoji stabil aus der User-ID abgeleitet, falls sich aus der Historie
// (siehe lerneUndSpeichere) noch nichts lernen ließ. Bewusst morgendlich/freundlich getönt.
export const GRUSS_EMOJIS = ['☀️', '🌅', '🌞', '🌻', '🌈', '☕', '🌷', '🌼', '🍀', '🐦', '🌤️', '🕊️'];

// Wie viele Nachrichten der Kanal-Historie beim Lernen zurück gescannt werden. Für einen kleinen
// Privatserver großzügig; paginiert in 100er-Schritten (Discord-Limit pro Fetch).
export const SCAN_LIMIT = 500;

// Ab wie vielen Beobachtungen ein Ko-Emoji als "persönliches" Emoji übernommen wird. 1 = jede
// Beobachtung zählt (kleiner Server, meist wird jede Person nur ein paarmal begrüßt); bei mehr Daten
// gewinnt ohnehin das häufigste. Leicht anhebbar, falls Einzel-Reaktionen zu viel Rauschen machen.
export const MIN_BEOBACHTUNGEN = 1;

// Deterministischer Hash über die User-ID → ein festes Emoji aus dem Pool. Reiner Fallback, wenn für
// die Person nichts gelernt wurde. Gleiche Person, gleiches Emoji - für immer, ohne Speicherung.
export function ableiteEmoji(userId: string): string {
    let hash = 0;
    for (const zeichen of userId) {
        hash = (hash * 31 + zeichen.charCodeAt(0)) >>> 0;
    }
    return GRUSS_EMOJIS[hash % GRUSS_EMOJIS.length];
}

// Kern der Historien-Auswertung (rein, exportiert + getestet): Aus den Reaktionen der vergangenen
// Nachrichten das persönliche Emoji je Autor:in ableiten. Signal der Tradition: auf einer Begrüßung
// von Person X liegt ein 👋 PLUS X's persönliches Emoji. Also: nur Nachrichten mit 👋 zählen, das
// häufigste Ko-Emoji (≠ 👋) je Autor:in gewinnt (Tie-Break deterministisch über den Emoji-String).
export function werteReaktionenAus(
    nachrichten: Array<{ authorId: string; emojis: string[] }>
): Record<string, string> {
    const zaehlung = new Map<string, Map<string, number>>();
    for (const {authorId, emojis} of nachrichten) {
        if (!emojis.includes(WELLE)) continue;
        for (const emoji of emojis) {
            if (emoji === WELLE) continue;
            const proAutor = zaehlung.get(authorId) ?? new Map<string, number>();
            proAutor.set(emoji, (proAutor.get(emoji) ?? 0) + 1);
            zaehlung.set(authorId, proAutor);
        }
    }

    const ergebnis: Record<string, string> = {};
    for (const [authorId, proAutor] of zaehlung) {
        const [emoji, anzahl] = [...proAutor.entries()].sort(
            (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
        )[0];
        if (anzahl >= MIN_BEOBACHTUNGEN) ergebnis[authorId] = emoji;
    }
    return ergebnis;
}

// Lokales Datum als YYYY-MM-DD (Host läuft auf Europe/Berlin) - Tagesmarker, wie beim Sport-Feature.
function formatTag(date: Date): string {
    const jahr = date.getFullYear();
    const monat = String(date.getMonth() + 1).padStart(2, '0');
    const tag = String(date.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
}

class GreetingHandler {
    async handleSetChannel(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const channel = interaction.options.getChannel('kanal', true);
        await greetingService.setChannel(channel.id);

        // Der Historien-Scan kann mehrere API-Calls kosten.
        await interaction.deferReply();
        const kanal = await this.holeTextkanal();
        const gelernt = kanal ? await this.lerneUndSpeichere(kanal) : null;

        const lernZeile = gelernt === null
            ? 'Die bisherige Historie konnte ich nicht scannen.'
            : `Aus der Historie habe ich ${gelernt} persönliche Emojis gelernt.`;
        return interaction.editReply(
            `Die erste Nachricht des Tages in <#${channel.id}> wird ab jetzt mit einem Morgengruß beantwortet. ${lernZeile}`
        );
    }

    // /morgengruss lernen: die gelernten Emojis aus der aktuellen Historie auffrischen.
    async handleLernen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();
        const kanal = await this.holeTextkanal();
        if (!kanal) {
            return interaction.editReply(
                'Es ist kein (abrufbarer) Morgengruß-Kanal gesetzt. Nutze zuerst `/morgengruss kanal`.'
            );
        }

        const gelernt = await this.lerneUndSpeichere(kanal);
        return interaction.editReply(`Aus der Historie habe ich ${gelernt} persönliche Emojis gelernt.`);
    }

    // Auto-Listener: begrüßt die erste Nachricht des Tages im Morgengruß-Kanal. Bewusst simpel -
    // egal welcher Inhalt, kein Schlüsselwort, kein Uhrzeitfenster. Bot-Nachrichten MÜSSEN ignoriert
    // werden, sonst könnte ein Bot-Post als "erste Nachricht des Tages" durchgehen.
    async handleMessage(message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<void> {
        if (message.author.bot) return;

        const kanalId = await greetingService.getChannel();
        if (!kanalId || message.channelId !== kanalId) return;

        const heute = formatTag(new Date());
        const letzterTag = await greetingService.getLastGreetingDay();
        if (letzterTag === heute) return;

        // Den Tag zuerst beanspruchen, dann reagieren - hält das Fenster für einen Doppelgruß klein
        // (bei zwei fast gleichzeitigen Nachrichten theoretisch möglich, aber harmlos: nur eine
        // zusätzliche Reaktion). Bewusst kein aufwändiges atomares SET NX für eine Hobby-Spielerei.
        await greetingService.setLastGreetingDay(heute);

        // Gelerntes Emoji bevorzugen; ohne Treffer der stabile Hash-Fallback. Fehlertolerant: ein
        // Redis-Problem darf den Gruß nicht ganz kosten.
        const gelernt = await greetingService.getLearnedEmojis().catch(() => ({} as Record<string, string>));
        const persoenlich = gelernt[message.author.id] ?? ableiteEmoji(message.author.id);

        // Reaktionen best-effort: ein Fehler bei einem Emoji darf das andere nicht verhindern.
        await message.react(WELLE).catch((error) => {
            console.error('Konnte den Morgengruß (Welle) nicht setzen:', error);
        });
        await message.react(persoenlich).catch((error) => {
            console.error('Konnte das persönliche Morgengruß-Emoji nicht setzen:', error);
        });
    }

    // Scannt die Kanal-Historie und schreibt die abgeleiteten Emojis in Redis. Gibt die Anzahl der
    // gelernten Zuordnungen zurück. Bestehende Einträge bleiben erhalten (niemand verliert sein Emoji).
    private async lerneUndSpeichere(channel: TextBasedChannel): Promise<number> {
        const nachrichten = await this.sammleGruossReaktionen(channel, SCAN_LIMIT);
        const map = werteReaktionenAus(nachrichten);
        for (const [userId, emoji] of Object.entries(map)) {
            await greetingService.setLearnedEmoji(userId, emoji);
        }
        return Object.keys(map).length;
    }

    // Holt bis zu `limit` vergangene Nachrichten (paginiert, 100 je Fetch) und reduziert sie auf das,
    // was das Lernen braucht: Autor-ID + die Emojis der Reaktionen. Die aus der Historie geholten
    // Nachrichten tragen ihre Reaktionen (Emoji + Anzahl) schon im Payload - kein Nachladen nötig.
    private async sammleGruossReaktionen(
        channel: TextBasedChannel,
        limit: number
    ): Promise<Array<{ authorId: string; emojis: string[] }>> {
        const ergebnis: Array<{ authorId: string; emojis: string[] }> = [];
        let before: string | undefined;
        let geholt = 0;

        while (geholt < limit) {
            const batch = await channel.messages.fetch({limit: Math.min(100, limit - geholt), before});
            if (batch.size === 0) break;

            for (const nachricht of batch.values()) {
                const emojis = [...nachricht.reactions.cache.values()]
                    .map(reaktion => reaktion.emoji.id ?? reaktion.emoji.name)
                    .filter((emoji): emoji is string => Boolean(emoji));
                ergebnis.push({authorId: nachricht.author.id, emojis});
            }

            before = batch.last()?.id;
            geholt += batch.size;
            if (batch.size < 100) break;
        }

        return ergebnis;
    }

    // Konfigurierten Morgengruß-Kanal als Text-Kanal auflösen; null, wenn keiner gesetzt/abrufbar ist.
    private async holeTextkanal(): Promise<TextBasedChannel | null> {
        const channelId = await greetingService.getChannel();
        if (!channelId) return null;

        const channel = await client.channels.fetch(channelId).catch(() => null);
        return channel && channel.isTextBased() ? channel : null;
    }
}

export default new GreetingHandler();
