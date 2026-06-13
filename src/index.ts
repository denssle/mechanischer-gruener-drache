import {Events} from "discord.js";
import pjson from "../package.json" with {type: "json"};
import client from "./client.js";
import {deployCommands} from "./deploy-commands.js";
import {loadAllMembers} from "./handlers/member.handler.js";
import messageHandler from "./handlers/message.handler.js";
import "./handlers/interaction.handler.js";

client.on(Events.MessageCreate, messageHandler.messageCreate);

client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user?.tag} - Version ${pjson.version}`);
    await deployCommands();
    await loadAllMembers();
});

await client.login(process.env.BOT_TOKEN!);
