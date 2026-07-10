import {ChatInputCommandInteraction} from 'discord.js';

// Gesamt-Übersicht aller Befehle. Flache Einzelbefehle (kein eigenes hilfe) werden NUR hier
// erklärt - ein Test stellt sicher, dass jeder von ihnen hier auftaucht. Die Gruppen-Befehle
// (/sport, /twitch, /event) haben zusätzlich je ein eigenes `hilfe` mit allen Details.
export const HELP_TEXT =
    `**Befehlsübersicht – Mechanischer Grüner Drache**\n` +
    `Tippe \`/\` und den Befehl, um ihn zu nutzen. Zu Bereichen mit mehreren Unterbefehlen gibt es Details per \`/<bereich> hilfe\`.\n\n` +
    `**Spielwelt (lotgd.de)** (Details: \`/spielwelt\`)\n` +
    `\`/online\` – wer gerade im Spiel eingeloggt ist\n` +
    `\`/news\` – die neuesten Spiel-News · \`/ereignisse\` – was zuletzt im Spiel geschah (Kämpfe, Wiederbelebungen, Blamagen)\n` +
    `\`/charakter\` – Charakter-Infos aus der Kriegerliste (Details: \`/charakter hilfe\`)\n\n` +
    `**Twitch** (Details: \`/twitch hilfe\`)\n` +
    `\`/twitch verknuepfen\` – deinen Kanal hinterlegen; der Server wird benachrichtigt, wenn du live gehst\n\n` +
    `**Sport** (Details: \`/sport hilfe\`)\n` +
    `\`/sport eintragen\` – Kilometer eintragen · \`/sport gesamt\` – gemeinsame Gesamtsumme · \`/sport statistik\` – deine Übersicht\n\n` +
    `**Event** (Details: \`/event hilfe\`)\n` +
    `\`/event countdown\` – wie lange noch bis zum nächsten Community-Event?\n\n` +
    `**Spiel & Spaß**\n` +
    `\`/pingpong\` – eine Runde Ping-Pong · \`/pingbestenliste\` – die Bestenliste\n` +
    `\`/blahaj\` – Euro-Beträge in Blåhajs umrechnen (reagiert auch automatisch auf €-Beträge im Chat)\n\n` +
    `**Rollen zum Selbstvergeben**\n` +
    `An Button-Nachrichten (von Admins gepostet) gibst du dir per Klick selbst Rollen.\n\n` +
    `\`/version\` – aktuelle Bot-Version · \`/hilfe\` – diese Übersicht`;

class HilfeHandler {
    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(HELP_TEXT);
    }
}

export default new HilfeHandler();
