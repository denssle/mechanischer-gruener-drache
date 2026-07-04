import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits} from 'discord.js';
import eventService from '../services/event.service.js';

const DEFAULT_TITLE = 'das Community-Event';

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
        const titel = interaction.options.getString('titel') ?? DEFAULT_TITLE;

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
        return interaction.reply(`✅ **${titel}** wurde auf <t:${unix}:F> gesetzt (<t:${unix}:R>).`);
    }

    async handleCountdown(interaction: ChatInputCommandInteraction) {
        const event = await eventService.getEvent();
        if (!event) {
            return interaction.reply('📅 Aktuell ist kein Event angesetzt. Ein Admin kann eins mit `/event setzen` eintragen.');
        }

        const unix = Math.floor(event.timestamp / 1000);
        const diffMs = event.timestamp - Date.now();

        if (diffMs <= 0) {
            return interaction.reply(`🎉 **${event.title}** ist da – es ist so weit! (Termin war <t:${unix}:F>)`);
        }

        return interaction.reply(
            `⏳ Bis **${event.title}** ist es noch **${formatRemaining(diffMs)}**!\n` +
            `📅 Termin: <t:${unix}:F> (<t:${unix}:R>)`
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
