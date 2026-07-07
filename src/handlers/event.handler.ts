import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits} from 'discord.js';
import eventService from '../services/event.service.js';

// Parst "TT.MM.JJJJ" (+ optional "HH:MM") in einen Unix-Timestamp in ms. Gibt null bei
// ungültiger Eingabe zurück - inkl. Kalender-Validierung (z.B. 32.13. wird abgelehnt),
// weil new Date() sonst still auf den nächsten gültigen Tag normalisieren würde.
export function parseGermanDateTime(datum: string, uhrzeit: string | null): number | null {
    const dateMatch = datum.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!dateMatch) return null;

    let hours = 0;
    let minutes = 0;
    if (uhrzeit) {
        const timeMatch = uhrzeit.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!timeMatch) return null;
        hours = Number(timeMatch[1]);
        minutes = Number(timeMatch[2]);
        if (hours > 23 || minutes > 59) return null;
    }

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);

    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
        || date.getHours() !== hours || date.getMinutes() !== minutes) {
        return null;
    }

    return date.getTime();
}

export function formatRemaining(diffMs: number): string {
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`);
    // Minuten nur zeigen, wenn es keine Tage sind (sonst unnötig genau)
    if (minutes > 0 && days === 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`);

    if (parts.length === 0) return 'weniger als eine Minute';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1];
}

// Spielerischer Fallback, wenn kein Event gesetzt ist - eine zufällige Variation von
// "noch viel zu lange", passend zur "Noch X"-Formulierung des echten Countdowns.
export const NO_EVENT_REPLIES = [
    '⏳ Noch **viel zu lange**.',
    '⏳ Noch **ewig** – am Horizont ist kein Termin in Sicht.',
    '🔮 Noch **unbestimmt lange** – die Sterne schweigen.',
    '🕰️ Noch **gefühlt eine halbe Ewigkeit**.',
    '⏳ Noch **so lange, dass es sich nicht in Tagen messen lässt**.',
    '🐉 Noch **viel zu lange**. Geduld, junger Drache.',
    '⏳ Noch **viel zu lange** … und ehrlich gesagt danach noch etwas länger.',
    '🌌 Noch **eine kleine Unendlichkeit**.',
];

export function randomNoEventReply(): string {
    return NO_EVENT_REPLIES[Math.floor(Math.random() * NO_EVENT_REPLIES.length)];
}

class EventHandler {
    async handleSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const datum = interaction.options.getString('datum', true);
        const uhrzeit = interaction.options.getString('uhrzeit');
        const titel = interaction.options.getString('titel') ?? undefined;

        const timestamp = parseGermanDateTime(datum, uhrzeit);
        if (timestamp === null) {
            return interaction.reply({
                content: '❌ Ungültiges Datum. Format: `TT.MM.JJJJ` (z.B. `24.12.2026`), Uhrzeit optional als `HH:MM`.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (timestamp <= Date.now()) {
            return interaction.reply({
                content: '❌ Das Datum liegt in der Vergangenheit.',
                flags: MessageFlags.Ephemeral
            });
        }

        await eventService.setEvent(timestamp, titel);

        const unix = Math.floor(timestamp / 1000);
        const was = titel ? `**${titel}**` : 'Das nächste Event';
        return interaction.reply(`✅ ${was} wurde auf <t:${unix}:F> gesetzt (<t:${unix}:R>).`);
    }

    async handleCountdown(interaction: ChatInputCommandInteraction) {
        const event = await eventService.getEvent();
        if (!event) {
            return interaction.reply(randomNoEventReply());
        }

        const unix = Math.floor(event.timestamp / 1000);
        const diffMs = event.timestamp - Date.now();
        // Titel steht bewusst nicht in einer Präposition ("bis zum {titel}"), sondern nach
        // einem Gedankenstrich - so umgeht man Artikel/Genus-Probleme (z.B. "die LAN-Party").
        const titelTeil = event.title ? ` – **${event.title}**` : '';

        if (diffMs <= 0) {
            const text = event.title
                ? `🎉 **${event.title}** ist da – es ist so weit!`
                : '🎉 Es ist so weit – das Event ist da!';
            return interaction.reply(`${text} (Termin war <t:${unix}:F>)`);
        }

        return interaction.reply(
            `⏳ Noch **${formatRemaining(diffMs)}** bis zum nächsten Event${titelTeil}!\n` +
            `📅 Termin: <t:${unix}:F> (<t:${unix}:R>)`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `📖 **Event-Befehle**\n\n` +
            `**/event countdown** – Zeigt, wie lange es noch bis zum nächsten Event dauert\n` +
            `**/event hilfe** – Zeigt diese Übersicht`
        );
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const event = await eventService.getEvent();
        if (!event) {
            return interaction.reply({ content: 'Es ist gar kein Event gesetzt.', flags: MessageFlags.Ephemeral });
        }

        await eventService.clearEvent();
        return interaction.reply(`🗑️ **${event.title}** wurde entfernt.`);
    }
}

export default new EventHandler();
