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
        GatewayIntentBits.GuildMessageReactions
    ],
    // Ohne Partials feuern MessageDelete/MessageUpdate/MessageReactionAdd/-Remove für
    // nicht (mehr) gecachte Nachrichten/Reactions gar nicht erst - wichtig fürs
    // Nachrichten-Logging und die Reaction-Roles (die sollen ja auch nach einem
    // Bot-Neustart noch auf alte Nachrichten reagieren können).
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

client.commands = new Collection();

for (const command of commands) {
    client.commands.set(command.data.name, command);
}

export default client;
