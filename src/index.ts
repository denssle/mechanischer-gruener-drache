import {Events} from "discord.js";
import pjson from "../package.json" with {type: "json"};
import client from "./client.js";
import redisService from "./services/redis.service.js";
import {deployCommands} from "./deploy-commands.js";
import {loadAllMembers} from "./handlers/member.handler.js";
import messageHandler from "./handlers/message.handler.js";
import "./handlers/interaction.handler.js";
import config from "../config.json" with {type: "json"};
import webhookServer from './server/twitch.webhook.server.js';

webhookServer.onNotification((twitchUserId, streamData) => {
    // kommt später: Discord-Nachricht schicken
    console.log(`${streamData.broadcaster_user_name} ist live!`);
});

webhookServer.start(3000);

client.on(Events.MessageCreate, messageHandler.messageCreate);

client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user?.tag} - Version ${pjson.version}`);
    await redisService.connect();
    await deployCommands();
    await loadAllMembers();
});

await client.login(config.BOT_TOKEN);
