import {Client, Collection, GatewayIntentBits, MessageMentionOptions, Partials} from "discord.js";
import commands from './commands/index.js';
import kontextBefehle from './commands/kontextmenues.js';
import { Command, KontextCommand } from './types/discord.js';

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
        // Getrennte Ablage, weil Kontextmenü-Befehle eine andere Interaction bekommen; die Namen
        // ("Als Bash-Zitat speichern") liegen ohnehin in einem eigenen Namensraum.
        kontextBefehle: Collection<string, KontextCommand>;
    }
}

// Sicher per Voreinstellung: Der Bot pingt niemanden, außer eine Nachricht erlaubt es ausdrücklich
// (Allowlist, siehe CLAUDE.md). Eine vergessene Stelle bleibt damit stumm, statt fremden Text pingen
// zu lassen. repliedUser bleibt an: wer eine Antwort auf die eigene Nachricht bekommt, soll es merken.
export const STANDARD_MENTIONS = {parse: [], repliedUser: true} satisfies MessageMentionOptions;

const client = new Client({
    allowedMentions: STANDARD_MENTIONS,
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ],
    // Ohne Partials feuern MessageDelete/MessageUpdate für nicht (mehr) gecachte
    // Nachrichten gar nicht erst - wichtig fürs Nachrichten-Logging.
    partials: [Partials.Message, Partials.Channel]
});

client.commands = new Collection();
client.kontextBefehle = new Collection();

for (const command of commands) {
    client.commands.set(command.data.name, command);
}

for (const befehl of kontextBefehle) {
    client.kontextBefehle.set(befehl.data.name, befehl);
}

export default client;
