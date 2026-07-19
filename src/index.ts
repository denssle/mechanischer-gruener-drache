import {Events} from "discord.js";
import pjson from "../package.json" with {type: "json"};
import client from "./client.js";
import redisService from "./services/redis.service.js";
import {deployCommands} from "./deploy-commands.js";
import memberHandler from "./handlers/member.handler.js";
import "./handlers/interaction.handler.js";
import loggingHandler from "./handlers/logging.handler.js";
import config from "../config.json" with {type: "json"};
import webhookServer from './server/twitch.webhook.server.js';
import twitchHandler from "./handlers/twitch.handler.js";
import blahajHandler from "./handlers/blahaj.handler.js";
import sportHandler from "./handlers/sport.handler.js";

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

// Async void-Callback: braucht .catch, sonst killt eine unhandled rejection den Prozess (siehe CLAUDE.md).
client.on(Events.MessageCreate, (message) => {
    blahajHandler.handleMessage(message).catch((error) => {
        console.error('Fehler im Blåhaj-Handler:', error);
    });
});
// Sport-Auto-Erfassung: km-Angaben im Sport-Kanal werden automatisch eingetragen (der Handler
// prüft den Kanal selbst). Eigene Zuständigkeit, deshalb eine eigene MessageCreate-Registrierung.
client.on(Events.MessageCreate, (message) => {
    sportHandler.handleMessage(message).catch((error) => {
        console.error('Fehler im Sport-Handler (MessageCreate):', error);
    });
});
// Nachrichten-Cache fürs Logging (alter Inhalt beim Löschen/Bearbeiten) - eigene Zuständigkeit,
// deshalb eine eigene MessageCreate-Registrierung neben blahajHandler/sportHandler.
client.on(Events.MessageCreate, (message) => {
    loggingHandler.handleMessageCreate(message).catch((error) => {
        console.error('Fehler im Logging-Handler (MessageCreate):', error);
    });
});
client.on(Events.MessageDelete, (message) => loggingHandler.handleMessageDelete(message));
client.on(Events.MessageUpdate, (oldMessage, newMessage) => loggingHandler.handleMessageUpdate(oldMessage, newMessage));
// Sport-Auto-Erfassung auch für nachträglich bearbeitete Nachrichten (typischer Fall: das "+" wurde
// vergessen und wird nachgetragen). Der Handler schützt sich per eigener Reaktion gegen Doppel-Einträge.
client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
    sportHandler.handleMessageUpdate(newMessage).catch((error) => {
        console.error('Fehler im Sport-Handler (MessageUpdate):', error);
    });
});
client.on(Events.GuildMemberAdd, (member) => loggingHandler.handleGuildMemberAdd(member));
client.on(Events.GuildMemberRemove, (member) => loggingHandler.handleGuildMemberRemove(member));
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => loggingHandler.handleGuildMemberUpdate(oldMember, newMember));
client.on(Events.GuildBanAdd, (ban) => loggingHandler.handleGuildBanAdd(ban));
client.on(Events.GuildBanRemove, (ban) => loggingHandler.handleGuildBanRemove(ban));
client.on(Events.MessageBulkDelete, (messages, channel) => loggingHandler.handleMessageBulkDelete(messages, channel));

// Prüfintervall für den täglichen Kilometerstand-Post. Der Handler entscheidet selbst per
// Tagesmarker, ob wirklich gepostet wird - der Timer stupst nur regelmäßig an (jede Minute reicht
// für eine "um Mitternacht"-Meldung und holt einen verpassten Tag nach dem Neustart nach).
const TAEGLICHER_POST_INTERVALL_MS = 60 * 1000;

client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user?.tag} - Version ${pjson.version}`);
    try {
        await redisService.connect();
        await deployCommands();
        await memberHandler.loadAllMembers();
        // Erst nach der Redis-Verbindung: verhindert einen Überraschungs-Post beim ersten Deploy.
        await sportHandler.initTaeglicherPost();
        setInterval(() => {
            sportHandler.posteTaeglichenKilometerstand().catch((error) => {
                console.error('Fehler im täglichen Kilometerstand-Post:', error);
            });
        }, TAEGLICHER_POST_INTERVALL_MS);
    } catch (error) {
        console.error('Fehler beim Initialisieren nach dem Discord-Login:', error);
    }
});

if (process.env.CI) {
    console.log("CI-Umgebung erkannt - überspringe Discord-Login.");
} else {
    await client.login(config.BOT_TOKEN);
}
