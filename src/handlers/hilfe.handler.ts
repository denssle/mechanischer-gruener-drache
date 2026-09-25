import {ChatInputCommandInteraction} from 'discord.js';

// Gesamt-Übersicht aller Befehle. Flache Einzelbefehle (kein eigenes hilfe) werden NUR hier
// erklärt - ein Test stellt sicher, dass jeder von ihnen hier auftaucht. Die Gruppen-Befehle
// (/sport, /twitch, /event, /pingpong, /charakter) haben zusätzlich je ein eigenes `hilfe` mit allen Details.
export const HELP_TEXT =
    `**Befehlsübersicht – Mechanischer Grüner Drache**\n` +
    `Tippe \`/\` und den Befehl, um ihn zu nutzen. Zu Bereichen mit mehreren Unterbefehlen gibt es Details per \`/<bereich> hilfe\`.\n\n` +
    `**Spielwelt (lotgd.de)** (Details: \`/spielwelt\`)\n` +
    `\`/online\` – wer gerade im Spiel eingeloggt ist\n` +
    `\`/news\` – die neuesten Spiel-News · \`/ereignisse\` – was zuletzt im Spiel geschah (Kämpfe, Wiederbelebungen, Blamagen)\n` +
    `\`/charakter\` – Charakter-Infos aus der Kriegerliste (Details: \`/charakter hilfe\`)\n` +
    `\`/beobachten hinzufuegen\` – DM bekommen, wenn ein bestimmter Charakter online geht (Details: \`/beobachten hilfe\`)\n\n` +
    `**Twitch** (Details: \`/twitch hilfe\`)\n` +
    `\`/twitch verknuepfen\` – deinen Kanal hinterlegen; der Server wird benachrichtigt, wenn du live gehst\n\n` +
    `**Sport** (Details: \`/sport hilfe\`)\n` +
    `\`/sport eintragen\` – km/Minuten eintragen · \`/sport gesamt\` – Gesamtsumme · \`/sport statistik\` – deine Übersicht\n` +
    `Im Sport-Kanal: „+12 km gelaufen", „+45 min Krafttraining" – „+" ist Pflicht.\n\n` +
    `**Event** (Details: \`/event hilfe\`)\n` +
    `\`/event countdown\` – wie lange noch bis zum nächsten Community-Event?\n\n` +
    `**Spiel & Spaß**\n` +
    `\`/pingpong herausfordern\` – jemanden zum Ping-Pong-Duell fordern, er nimmt per Button an\n` +
    `\`/pingpong ansageduell\` · \`/pingpong taktikduell\` · \`/pingpong rundlauf\` – mit Ansage, mit verdeckter Aktion, zu mehreren\n` +
    `\`/pingpong ruhmeshalle\` – die Punkte laufen monatsweise, hier stehen die Champions (Details: \`/pingpong hilfe\`)\n` +
    `\`/blahaj\` – Euro-Beträge in Blåhajs umrechnen (reagiert auch automatisch auf €-Beträge im Chat)\n` +
    `\`/rollenspiel suche\` – dich als Roleplay-suchend melden und Mitspieler finden (Details: \`/rollenspiel hilfe\`)\n` +
    `\`/anstupser an\` – täglich um 13:37 eine DM vom Bot; rein freiwillig (Details: \`/anstupser hilfe\`)\n` +
    `\`/geburtstag setzen\` – deinen Geburtstag hinterlegen, damit der Bot gratuliert (Details: \`/geburtstag hilfe\`)\n` +
    `\`/bash zitat\` – Sprüche aus dem Chat festhalten und wiederfinden (Details: \`/bash hilfe\`)\n\n` +
    `\`/version\` – aktuelle Bot-Version · \`/hilfe\` – diese Übersicht`;

class HilfeHandler {
    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(HELP_TEXT);
    }
}

export default new HilfeHandler();
