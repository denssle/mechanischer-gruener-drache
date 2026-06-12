import Discord from "discord.js";
import config from "./config.json" with {type: "json"};
import {createClient} from 'redis';
import pjson from './package.json' with {type: 'json'};

const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ]
});


const redisClient = createClient();

redisClient.on('error', err => console.log('Redis Client Error', err));

await redisClient.connect();

client.on(Discord.Events.ClientReady, () => {
    console.log(`Eingeloggt als ${client.user.tag}! Version ${pjson.version}`);
});

client.on(Discord.Events.MessageCreate, message => {
    console.log(`Nachricht von ${message.author.tag}: ${message.content}`);

    // Ignoriere Nachrichten von Bots (inklusive sich selbst)
    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Pong!");
    }

    if (message.content === "!version") {
        message.reply("Aktuelle Version: " + pjson.version);
    }
});


client.login(config.BOT_TOKEN);