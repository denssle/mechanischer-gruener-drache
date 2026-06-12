import Discord from "discord.js";
import config from "./config.json" with {type: "json"};
import pjson from "./package.json" with {type: "json"};

import {startRedis} from "./redis.js";
import {handleMessage} from "./handler/messageHandler.js";

const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ]
});

await startRedis();

client.once(Discord.Events.ClientReady, () => {
    console.log(
        `Eingeloggt als ${client.user.tag}! Version ${pjson.version}`
    );
});

client.on(
    Discord.Events.MessageCreate, handleMessage
);

await client.login(config.BOT_TOKEN);