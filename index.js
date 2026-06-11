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

client.on(Discord.Events.ClientReady, () => {
    console.log(`Eingeloggt als ${client.user.tag}!`);
});

client.on(Discord.Events.MessageCreate, message => {
    // Ignoriere Nachrichten von Bots (inklusive sich selbst)
    if (message.author.bot) return;

    console.log(`Nachricht von ${message.author.tag}: ${message.content}`);

    if (message.content === "!ping") {
        message.reply("Pong!");
    }
});

client.login(config.BOT_TOKEN);