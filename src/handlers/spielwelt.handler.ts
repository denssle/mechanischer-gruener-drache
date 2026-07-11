import {ChatInputCommandInteraction} from 'discord.js';

// Detail-Hilfe für die drei Spiel-Daten-Befehle. Sie sind flache Commands (kein eigenes
// `hilfe`-Subcommand möglich, sonst fiele das blanke `/news` weg), deshalb bündelt dieser
// eigene flache Befehl ihre Erklärung - Parallele zu `/hilfe`.
export const SPIELWELT_HELP =
    `**Spielwelt (lotgd.de)** – Daten live aus dem Spiel\n\n` +
    `\`/news\` – die neueste Ankündigung der Spielbetreiber (die „News" von lotgd.de).\n` +
    `\`/ereignisse\` – das Ingame-Geschehen: die letzten Kämpfe, Wiederbelebungen und Blamagen der Mitspielenden.\n` +
    `\`/online\` – wer gerade eingeloggt ist (mit Stufe, Rasse, Ort und Gilde), dazu die Namen der letzten 30 Minuten.\n` +
    `\`/charakter\` – deinen Charakter verknüpfen und seine Karte abrufen (Details: \`/charakter hilfe\`).\n\n` +
    `Wer seinen Charakter verknüpft hat, wird in \`/online\` und \`/ereignisse\` hervorgehoben.\n` +
    `Alle Befehle holen die Daten direkt von lotgd.de – ohne Login, immer frisch auf Abruf.`;

class SpielweltHandler {
    async handleSpielwelt(interaction: ChatInputCommandInteraction) {
        return interaction.reply(SPIELWELT_HELP);
    }
}

export default new SpielweltHandler();
