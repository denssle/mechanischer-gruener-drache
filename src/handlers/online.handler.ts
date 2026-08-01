import {ChatInputCommandInteraction} from 'discord.js';
import onlineService, {OnlinePlayer} from '../services/online.service.js';
import characterService, {CharacterLink, findLinkForName} from '../services/character.service.js';
import spielzeitService from '../services/spielzeit.service.js';
import drachenHandler from './drachen.handler.js';

// Discord-Nachrichtenlimit ist 2000 Zeichen; mit Puffer bleiben, lieber ganze Einträge weglassen.
const MAX_LENGTH = 1900;

// Verknüpfte Charaktere werden fett gesetzt und mit ihrem Discord-User beschriftet. Die Erwähnung
// wird beim Senden per allowedMentions entschärft - /online soll niemanden anpingen.
function markLinked(name: string, link: CharacterLink | null): string {
    return link ? `**${name}** (<@${link.discordUserId}>)` : name;
}

// Ort fällt hier bewusst raus - er steht als Gruppen-Überschrift über den Zeilen (siehe groupByCity).
function formatPlayer(player: OnlinePlayer, links: CharacterLink[]): string {
    const gilde = player.gilde ? `${player.gilde} ` : '';
    const tot = player.lebt ? '' : ' (tot)';
    const name = markLinked(player.name, findLinkForName(links, player.name));
    return `${gilde}${name} — Stufe ${player.level} ${player.rasse}${tot}`;
}

// Gruppiert die eingeloggten Spieler nach Ort. Reihenfolge: nach Gruppengröße absteigend
// (die belebten Städte zuerst - dort ist "was los"), bei Gleichstand alphabetisch, damit die
// Ausgabe stabil bleibt. Leere Ort-Angabe (sollte nicht vorkommen) wird zu "Unbekannt".
export function groupByCity(players: OnlinePlayer[]): Array<{ ort: string; spieler: OnlinePlayer[] }> {
    const map = new Map<string, OnlinePlayer[]>();
    for (const player of players) {
        const ort = player.ort || 'Unbekannt';
        const bucket = map.get(ort) ?? map.set(ort, []).get(ort)!;
        bucket.push(player);
    }
    return [...map.entries()]
        .map(([ort, spieler]) => ({ort, spieler}))
        .sort((a, b) => b.spieler.length - a.spieler.length || a.ort.localeCompare(b.ort, 'de'));
}

// Als Discord-Timestamp (<t:unix:R>), der sich beim Betrachter selbst aktualisiert. Möglich
// ohne Annahme über die Zeitzone des Spielservers, weil die Seite eine Restdauer liefert und
// spielzeitService sie auf unsere eigene Uhr rechnet. null = Abruf/Markup kaputt, dann fällt
// die Zeile ersatzlos weg: der Countdown ist ein Bonus, er darf die Online-Liste nie kosten.
function formatTageswechsel(zielMs: number | null): string | null {
    if (zielMs === null) return null;
    return `\n_Der neue Tag bricht <t:${Math.floor(zielMs / 1000)}:R> an._`;
}

class OnlineHandler {
    async handleOnline(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        // Zwei unabhängige Seiten (list.php + about.php), also parallel abrufen.
        const [data, zielMs] = await Promise.all([
            onlineService.getOnline(),
            spielzeitService.getTageswechsel(),
        ]);
        const tageswechselZeile = formatTageswechsel(zielMs);

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

        // Opportunistische Drachentötungs-Erkennung mit den ohnehin geholten Stufen - kein
        // zusätzlicher Abruf. Bewusst NICHT abgewartet: die Liste soll nicht auf einen
        // Redis-/Channel-Roundtrip warten, und der Handler fängt intern schon alles ab.
        void drachenHandler.pruefeLevel(players);

        const parts: string[] = [];
        let length = 0;
        // Platz für den Countdown vorab abziehen: an einem vollen Tag ist er sonst das Erste,
        // was rausfliegt - dabei fragt man dann am ehesten, ob sich der Wald noch lohnt.
        const budget = MAX_LENGTH - (tageswechselZeile?.length ?? 0);

        if (players.length === 0) {
            parts.push('Gerade ist niemand im Wyrmland eingeloggt.');
            length += parts[0].length + 1;
        } else {
            const header = `**Gerade im Wyrmland unterwegs (${players.length}):**`;
            parts.push(header);
            length += header.length + 1;

            let voll = false;
            for (const {ort, spieler} of groupByCity(players)) {
                if (voll) break;
                const stadtZeile = `__${ort}__ (${spieler.length})`;
                if (length + stadtZeile.length + 1 > budget) break;
                parts.push(stadtZeile);
                length += stadtZeile.length + 1;
                for (const player of spieler) {
                    const line = formatPlayer(player, links);
                    if (length + line.length + 1 > budget) {
                        voll = true;
                        break;
                    }
                    parts.push(line);
                    length += line.length + 1;
                }
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
                if (recentLength + addition.length + 3 > budget) break;
                fitting.push(marked);
                recentLength += addition.length;
            }
            if (fitting.length > 0) {
                const suffix = fitting.length < extras.length ? ', …' : '';
                parts.push(prefix + fitting.join(', ') + suffix);
            }
        }

        // Ist gerade niemand da, ist der Countdown die einzige Information - erst recht mitnehmen.
        if (players.length === 0 && extras.length === 0) {
            const leer = 'Gerade ist niemand im Wyrmland eingeloggt.';
            return interaction.editReply(leer + (tageswechselZeile ?? ''));
        }

        if (tageswechselZeile) parts.push(tageswechselZeile);

        return interaction.editReply({
            content: parts.join('\n'),
            allowedMentions: {parse: []},
        });
    }
}

export default new OnlineHandler();
