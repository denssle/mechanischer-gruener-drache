import {ChatInputCommandInteraction} from 'discord.js';
import newsService from '../services/news.service.js';

const EVENT_COUNT = 5;
// Discord-Nachrichtenlimit ist 2000 Zeichen; der Rest der Nachricht (Überschrift, Link)
// braucht den Puffer. Es werden nur ganze Ereignisse aufgenommen, nie halbe Sätze.
const MAX_EVENTS_LENGTH = 1500;

class EreignisseHandler {
    async handleEreignisse(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const gameEvents = await newsService.getGameEvents();
        if (!gameEvents) {
            return interaction.editReply('Konnte die Ereignisse gerade nicht abrufen. Versuch es später nochmal.');
        }

        const lines: string[] = [];
        let length = 0;
        for (const event of gameEvents.events.slice(0, EVENT_COUNT)) {
            const line = `- ${event}`;
            if (length + line.length > MAX_EVENTS_LENGTH) break;

            lines.push(line);
            length += line.length + 1;
        }

        // Passt nicht mal das erste Ereignis, lieber gekürzt zeigen als eine leere Liste.
        if (lines.length === 0) {
            lines.push(`- ${gameEvents.events[0].slice(0, MAX_EVENTS_LENGTH).trimEnd()} …`);
        }

        return interaction.editReply(
            `**Neuigkeiten am ${gameEvents.date}**\n\n${lines.join('\n')}\n\nAlle Ereignisse: <${gameEvents.url}>`
        );
    }
}

export default new EreignisseHandler();
