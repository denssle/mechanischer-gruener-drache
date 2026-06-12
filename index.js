const Discord = require("discord.js");
const config = require("./config.json");


const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ]
});
const pjson = require('./package.json');

client.on(Discord.Events.ClientReady, () => {
    console.log(`Eingeloggt als ${client.user.tag}!`);
});

client.on(Discord.Events.MessageCreate, message => {
    console.log(`Nachricht von ${message.author.tag}: ${message.content}`);

    // Ignoriere Nachrichten von Bots (inklusive sich selbst)
    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Pong!");
    }

    if (message.content === "!version") {
        message.reply(pjson.version);
    }
});

client.login(config.BOT_TOKEN);