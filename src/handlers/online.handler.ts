import {ChatInputCommandInteraction} from 'discord.js';
import onlineService, {OnlinePlayer} from '../services/online.service.js';
import characterService, {CharacterLink, findLinkForName} from '../services/character.service.js';

// Discord-Nachrichtenlimit ist 2000 Zeichen; mit Puffer bleiben, lieber ganze Einträge weglassen.
const MAX_LENGTH = 1900;

// Verknüpfte Charaktere werden fett gesetzt und mit ihrem Discord-User beschriftet. Die Erwähnung
// wird beim Senden per allowedMentions entschärft - /online soll niemanden anpingen.
function markLinked(name: string, link: CharacterLink | null): string {
    return link ? `**${name}** (<@${link.discordUserId}>)` : name;
}

function formatPlayer(player: OnlinePlayer, links: CharacterLink[]): string {
    const gilde = player.gilde ? `${player.gilde} ` : '';
    const tot = player.lebt ? '' : ' (tot)';
    const name = markLinked(player.name, findLinkForName(links, player.name));
    return `${gilde}${name} — Stufe ${player.level} ${player.rasse}, in ${player.ort}${tot}`;
}

class OnlineHandler {
    async handleOnline(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const data = await onlineService.getOnline();
        if (!data) {
            return interaction.editReply('Konnte die Kriegerliste gerade nicht abrufen. Versuch es später nochmal.');
        }

        // Fehlertolerant: eine kaputte Verknüpfungs-Abfrage darf die Online-Liste nicht kosten.
        let links: CharacterLink[] = [];
        try {
            links = await characterService.getAllLinks();
        } catch (error) {
            console.error('Konnte die Charakter-Verknüpfungen für /online nicht laden:', error);
        }

        const {players, recent} = data;
        const parts: string[] = [];
        let length = 0;

        if (players.length === 0) {
            parts.push('Gerade ist niemand im Wyrmland eingeloggt.');
            length += parts[0].length + 1;
        } else {
            const header = `**Gerade im Wyrmland unterwegs (${players.length}):**`;
            parts.push(header);
            length += header.length + 1;

            for (const player of players) {
                const line = formatPlayer(player, links);
                if (length + line.length + 1 > MAX_LENGTH) break;
                parts.push(line);
                length += line.length + 1;
            }
        }

        // 30-Minuten-Namen, die nicht ohnehin gerade eingeloggt sind (sonst Dopplung).
        const loggedIn = new Set(players.map(player => player.name));
        const extras = recent.filter(name => !loggedIn.has(name));
        if (extras.length > 0) {
            const prefix = '\n_Auch in den letzten 30 Minuten aktiv:_ ';
            const fitting: string[] = [];
            let recentLength = length + prefix.length;
            for (const name of extras) {
                const marked = markLinked(name, findLinkForName(links, name));
                const addition = (fitting.length ? ', ' : '') + marked;
                if (recentLength + addition.length + 3 > MAX_LENGTH) break;
                fitting.push(marked);
                recentLength += addition.length;
            }
            if (fitting.length > 0) {
                const suffix = fitting.length < extras.length ? ', …' : '';
                parts.push(prefix + fitting.join(', ') + suffix);
            }
        }

        if (players.length === 0 && extras.length === 0) {
            return interaction.editReply('Gerade ist niemand im Wyrmland eingeloggt.');
        }

        return interaction.editReply({
            content: parts.join('\n'),
            allowedMentions: {parse: []},
        });
    }
}

export default new OnlineHandler();
