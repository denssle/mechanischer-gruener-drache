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
import twitchHandler from "./handlers/twitch.handler.js";

webhookServer.onNotification((twitchUserId, streamData) => {
    twitchHandler.handleStreamOnline(twitchUserId, streamData);
});

webhookServer.start(3000);

client.on(Events.MessageCreate, messageHandler.messageCreate);

client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user?.tag} - Version ${pjson.version}`);
    await redisService.connect();
    await deployCommands();
    await loadAllMembers();
});

if (process.env.CI) {
    console.log("CI-Umgebung erkannt - überspringe Discord-Login.");
} else {
    await client.login(config.BOT_TOKEN);
}
