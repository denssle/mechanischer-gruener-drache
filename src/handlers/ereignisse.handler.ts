import {ChatInputCommandInteraction} from 'discord.js';
import newsService from '../services/news.service.js';
import characterService, {CharacterLink, findLinksInText} from '../services/character.service.js';

const EVENT_COUNT = 5;
// Discord-Nachrichtenlimit ist 2000 Zeichen; der Rest der Nachricht (Überschrift, Link)
// braucht den Puffer. Es werden nur ganze Ereignisse aufgenommen, nie halbe Sätze.
const MAX_EVENTS_LENGTH = 1500;

// Taucht ein verknüpfter Charakter im Ereignis auf, wird sein Name fett gesetzt und der Discord-User
// dahinter genannt. Die Erwähnung wird beim Senden per allowedMentions entschärft (kein Ping).
function highlightLinked(event: string, links: CharacterLink[]): string {
    const found = findLinksInText(links, event);
    if (found.length === 0) return event;

    let text = event;
    for (const link of found) {
        text = text.replaceAll(link.name, `**${link.name}**`);
    }
    return `${text} (${found.map(link => `<@${link.discordUserId}>`).join(', ')})`;
}

class EreignisseHandler {
    async handleEreignisse(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const gameEvents = await newsService.getGameEvents();
        if (!gameEvents) {
            return interaction.editReply('Konnte die Ereignisse gerade nicht abrufen. Versuch es später nochmal.');
        }

        // Fehlertolerant: eine kaputte Verknüpfungs-Abfrage darf das Ereignislog nicht kosten.
        let links: CharacterLink[] = [];
        try {
            links = await characterService.getAllLinks();
        } catch (error) {
            console.error('Konnte die Charakter-Verknüpfungen für /ereignisse nicht laden:', error);
        }

        const lines: string[] = [];
        let length = 0;
        for (const event of gameEvents.events.slice(0, EVENT_COUNT)) {
            const line = `- ${highlightLinked(event, links)}`;
            if (length + line.length > MAX_EVENTS_LENGTH) break;

            lines.push(line);
            length += line.length + 1;
        }

        // Passt nicht mal das erste Ereignis, lieber gekürzt zeigen als eine leere Liste.
        if (lines.length === 0) {
            lines.push(`- ${gameEvents.events[0].slice(0, MAX_EVENTS_LENGTH).trimEnd()} …`);
        }

        return interaction.editReply({
            content: `**Neuigkeiten am ${gameEvents.date}**\n\n${lines.join('\n')}\n\nAlle Ereignisse: <${gameEvents.url}>`,
            allowedMentions: {parse: []},
        });
    }
}

export default new EreignisseHandler();
