import {Events} from "discord.js";
import pjson from "../package.json" with {type: "json"};
import client from "./client.js";
import redisService from "./services/redis.service.js";
import {deployCommands} from "./deploy-commands.js";
import memberHandler from "./handlers/member.handler.js";
import messageHandler from "./handlers/message.handler.js";
import "./handlers/interaction.handler.js";
import loggingHandler from "./handlers/logging.handler.js";
import config from "../config.json" with {type: "json"};
import webhookServer from './server/twitch.webhook.server.js';
import twitchHandler from "./handlers/twitch.handler.js";

webhookServer.onNotification((twitchUserId, streamData) => {
    twitchHandler.handleStreamOnline(twitchUserId, streamData).catch((error) => {
        console.error('Fehler bei der Verarbeitung der Twitch-Benachrichtigung:', error);
    });
});

webhookServer.onRevocation((subscriptionId, reason) => {
    twitchHandler.handleSubscriptionRevoked(subscriptionId, reason).catch((error) => {
        console.error('Fehler bei der Verarbeitung des Twitch-Subscription-Widerrufs:', error);
    });
});

webhookServer.start(3000);

client.on(Events.MessageCreate, messageHandler.messageCreate);
client.on(Events.MessageDelete, (message) => loggingHandler.handleMessageDelete(message));
client.on(Events.MessageUpdate, (oldMessage, newMessage) => loggingHandler.handleMessageUpdate(oldMessage, newMessage));
client.on(Events.GuildMemberAdd, (member) => loggingHandler.handleGuildMemberAdd(member));
client.on(Events.GuildMemberRemove, (member) => loggingHandler.handleGuildMemberRemove(member));
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => loggingHandler.handleGuildMemberUpdate(oldMember, newMember));

client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user?.tag} - Version ${pjson.version}`);
    try {
        await redisService.connect();
        await deployCommands();
        await memberHandler.loadAllMembers();
    } catch (error) {
        console.error('Fehler beim Initialisieren nach dem Discord-Login:', error);
    }
});

if (process.env.CI) {
    console.log("CI-Umgebung erkannt - überspringe Discord-Login.");
} else {
    await client.login(config.BOT_TOKEN);
}
