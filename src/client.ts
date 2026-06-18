import {Client, Collection, GatewayIntentBits} from "discord.js";
import commands from './commands/index.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

for (const command of commands) {
    client.commands.set(command.data.name, command);
}

export default client;
