import {Client, Collection, GatewayIntentBits, Partials} from "discord.js";
import commands from './commands/index.js';
import { Command } from './types/discord.js';

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

const client = new Client({
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

for (const command of commands) {
    client.commands.set(command.data.name, command);
}

export default client;
