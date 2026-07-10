import {ChatInputCommandInteraction} from 'discord.js';
import onlineService, {OnlinePlayer} from '../services/online.service.js';

// Discord-Nachrichtenlimit ist 2000 Zeichen; mit Puffer bleiben, lieber ganze Einträge weglassen.
const MAX_LENGTH = 1900;

function formatPlayer(player: OnlinePlayer): string {
    const gilde = player.gilde ? `${player.gilde} ` : '';
    const tot = player.lebt ? '' : ' (tot)';
    return `${gilde}${player.name} — Stufe ${player.level} ${player.rasse}, in ${player.ort}${tot}`;
}

class OnlineHandler {
    async handleOnline(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const data = await onlineService.getOnline();
        if (!data) {
            return interaction.editReply('Konnte die Kriegerliste gerade nicht abrufen. Versuch es später nochmal.');
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
                const line = formatPlayer(player);
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
                const addition = (fitting.length ? ', ' : '') + name;
                if (recentLength + addition.length + 3 > MAX_LENGTH) break;
                fitting.push(name);
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

        return interaction.editReply(parts.join('\n'));
    }
}

export default new OnlineHandler();
