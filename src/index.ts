import {Events} from "discord.js";
import pjson from "../package.json" with {type: "json"};
import {installLogCapture} from "./services/logBuffer.service.js";
import client from "./client.js";
import redisService from "./services/redis.service.js";
import {deployCommands} from "./deploy-commands.js";
import memberHandler from "./handlers/member.handler.js";
import "./handlers/interaction.handler.js";
import loggingHandler from "./handlers/logging.handler.js";
import config from "../config.json" with {type: "json"};
import webhookServer from './server/twitch.webhook.server.js';
import configRouter from './server/config.router.js';
import twitchHandler from "./handlers/twitch.handler.js";
import blahajHandler from "./handlers/blahaj.handler.js";
import sportHandler from "./handlers/sport.handler.js";
import greetingHandler from "./handlers/greeting.handler.js";
import anstupserHandler from "./handlers/anstupser.handler.js";
import geburtstagHandler from "./handlers/geburtstag.handler.js";
import pingPongSeasonHandler from "./handlers/pingPongSeason.handler.js";

// console.log/warn/error in einen Ringpuffer spiegeln, damit sie auf /config einsehbar sind. Moeglichst
// frueh, damit die Boot-/Laufzeit-Zeilen (Webhook-Server-Start, Fehler) mitgeschnitten werden.
installLogCapture();

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

// Verwaltungsseite (erster "Hello World"-Entwurf) an dieselbe Express-App wie der Twitch-Webhook
// haengen - ein Port, ein Server. Muss vor start() passieren. /config matcht nicht /twitch, der
// Twitch-Raw-Body-Parser bleibt also unberuehrt.
webhookServer.app.use(configRouter);

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
// Morgengruß: die erste Nachricht des Tages im konfigurierten Kanal wird per Reaktion begrüßt
// (der Handler prüft Kanal und Tagesmarker selbst). Eigene Zuständigkeit, eigene Registrierung.
client.on(Events.MessageCreate, (message) => {
    greetingHandler.handleMessage(message).catch((error) => {
        console.error('Fehler im Morgengruß-Handler:', error);
    });
});
// Alle Logging-Registrierungen mit .catch(): die Handler fangen ihre Fehler zwar selbst (bei jedem
// ist `try {` die erste Anweisung), aber das ist Disziplin IM Handler - eine Zeile vor dem try oder
// ein neuer Handler ohne try würde als unhandled rejection den kompletten Prozess killen (siehe
// CLAUDE.md, am 2026-07-03 live passiert). Die Registrierung selbst darf sich darauf nicht verlassen.
client.on(Events.MessageDelete, (message) => {
    loggingHandler.handleMessageDelete(message).catch((error) => {
        console.error('Fehler im Logging-Handler (MessageDelete):', error);
    });
});
client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    loggingHandler.handleMessageUpdate(oldMessage, newMessage).catch((error) => {
        console.error('Fehler im Logging-Handler (MessageUpdate):', error);
    });
});
// Sport-Auto-Erfassung auch für nachträglich bearbeitete Nachrichten (typischer Fall: das "+" wurde
// vergessen und wird nachgetragen). Der Handler schützt sich per eigener Reaktion gegen Doppel-Einträge.
client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
    sportHandler.handleMessageUpdate(newMessage).catch((error) => {
        console.error('Fehler im Sport-Handler (MessageUpdate):', error);
    });
});
client.on(Events.GuildMemberAdd, (member) => {
    loggingHandler.handleGuildMemberAdd(member).catch((error) => {
        console.error('Fehler im Logging-Handler (GuildMemberAdd):', error);
    });
});
client.on(Events.GuildMemberRemove, (member) => {
    loggingHandler.handleGuildMemberRemove(member).catch((error) => {
        console.error('Fehler im Logging-Handler (GuildMemberRemove):', error);
    });
});
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    loggingHandler.handleGuildMemberUpdate(oldMember, newMember).catch((error) => {
        console.error('Fehler im Logging-Handler (GuildMemberUpdate):', error);
    });
});
client.on(Events.GuildBanAdd, (ban) => {
    loggingHandler.handleGuildBanAdd(ban).catch((error) => {
        console.error('Fehler im Logging-Handler (GuildBanAdd):', error);
    });
});
client.on(Events.GuildBanRemove, (ban) => {
    loggingHandler.handleGuildBanRemove(ban).catch((error) => {
        console.error('Fehler im Logging-Handler (GuildBanRemove):', error);
    });
});
client.on(Events.MessageBulkDelete, (messages, channel) => {
    loggingHandler.handleMessageBulkDelete(messages, channel).catch((error) => {
        console.error('Fehler im Logging-Handler (MessageBulkDelete):', error);
    });
});
// Änderungen an Rollen, Kanälen und Webhooks. Feuert nur, wenn der Bot das Server-Recht
// "Audit-Log ansehen" hat - fehlt es, bleibt es still (deshalb prüft /diagnose das mit).
client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    loggingHandler.handleAuditLogEntry(entry, guild).catch((error) => {
        console.error('Fehler im Logging-Handler (GuildAuditLogEntryCreate):', error);
    });
});

// Prüfintervall für die täglichen Aufgaben. Die Handler entscheiden selbst per Tagesmarker, ob
// wirklich etwas zu tun ist - der Timer stupst nur regelmäßig an (jede Minute reicht für eine
// "um Mitternacht"-Meldung und holt einen verpassten Tag nach dem Neustart nach). BEWUSST EIN
// EINZIGER TIMER für alle täglichen Aufgaben, kein zweiter Mechanismus und keine Cron-Dependency.
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
            // Prüft selbst auf 13:37 und den eigenen Tagesmarker; holt einen verpassten Tag
            // bewusst NICHT nach (ein Anstupser um 15 Uhr wäre sinnlos).
            anstupserHandler.sendeAnstupser().catch((error) => {
                console.error('Fehler beim täglichen Anstupser:', error);
            });
            // Prüft selbst auf die Gratulationszeit und den eigenen Tagesmarker; holt einen
            // verpassten Tag bewusst NICHT nach (ein "alles Gute" von gestern ist keins mehr).
            geburtstagHandler.posteGeburtstagsgruesse().catch((error) => {
                console.error('Fehler beim Posten der Geburtstagsgrüße:', error);
            });
            // Prüft selbst per Monatsmarker, ob die Ping-Pong-Season abzurechnen ist; ein
            // verpasster Monatswechsel wird bewusst nachgeholt. Fehlt der Marker ganz (frischer
            // Deploy), setzt der Aufruf ihn selbst - deshalb braucht es hier keinen Init-Schritt.
            pingPongSeasonHandler.rechneSeasonAb().catch((error) => {
                console.error('Fehler beim Abrechnen der Ping-Pong-Season:', error);
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
