import Discord, {Collection} from "discord.js";
import config from "./config.json" with {type: "json"};
import pjson from "./package.json" with {type: "json"};
import messageHandler from "./handlers/message.handler.js";
import commands from './commands/index.js';
import userService from "./services/user.service.js";

const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ]
});


client.once(Discord.Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user.tag} - Version ${pjson.version}`);

    for (const guild of client.guilds.cache.values()) {
        const collection = await guild.members.fetch();

        console.log(
            `Loaded members for ${guild.name}: ${collection.size}`
        );

        collection.forEach((user) => {
            userService.saveUser(user);
        });
    }
});


client.on(
    Discord.Events.MessageCreate, messageHandler.messageCreate
);

client.on(
    Discord.Events.GuildMemberAdd,
    member => {
        console.log(`${member.user.tag} ist dem Server beigetreten.`);
    }
);

client.on(
    Discord.Events.GuildMemberRemove,
    member => {
        console.log(`${member.user.tag} hat den Server verlassen.`);
    }
);

client.on(
    Discord.Events.GuildMemberUpdate,
    (oldMember, newMember) => {
        console.log(`${newMember.user.tag} wurde aktualisiert.`);
    }
);

client.on(
    Discord.Events.UserUpdate,
    (oldUser, newUser) => {
        console.log(
            `${oldUser.username} -> ${newUser.username}`
        );
    }
);


client.commands = new Collection();

for (const command of commands) {
    client.commands.set(command.data.name, command);
}

await client.login(config.BOT_TOKEN);