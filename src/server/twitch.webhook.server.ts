import express, {Request, Response} from 'express';
import {createHmac, timingSafeEqual} from 'crypto';
import config from '../../config.json' with {type: 'json'};
import {StreamOnlineEvent} from "../types/streamOnlineEvent.js";

const TWITCH_MESSAGE_ID = 'twitch-eventsub-message-id';
const TWITCH_MESSAGE_TIMESTAMP = 'twitch-eventsub-message-timestamp';
const TWITCH_MESSAGE_SIGNATURE = 'twitch-eventsub-message-signature';
const TWITCH_MESSAGE_TYPE = 'twitch-eventsub-message-type';

// Replay-Schutz: Nachrichten, deren Twitch-Timestamp älter ist, werden abgelehnt (Twitch
// empfiehlt 10 Minuten). Ohne den Check bliebe ein mitgeschnittener, gültig signierter
// Request beliebig lange wiederverwendbar - der Timestamp ist mitsigniert, kann also nicht
// einfach aufgefrischt werden.
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

const MESSAGE_TYPE_VERIFICATION = 'webhook_callback_verification';
const MESSAGE_TYPE_NOTIFICATION = 'notification';
const MESSAGE_TYPE_REVOCATION = 'revocation';

type NotificationCallback = (twitchUserId: string, streamData: StreamOnlineEvent) => void;
type RevocationCallback = (subscriptionId: string, reason: string) => void;

class TwitchWebhookServer {
    #app = express();
    #notificationCallback: NotificationCallback | null = null;
    #revocationCallback: RevocationCallback | null = null;

    get app() {
        return this.#app;
    }

    constructor() {
        this.#app.use('/twitch', express.raw({type: 'application/json'}));
        this.#app.post('/twitch/eventsub', (req: Request, res: Response) => {
            this.#handleEventSub(req, res);
        });
    }

    onNotification(callback: NotificationCallback) {
        this.#notificationCallback = callback;
    }

    onRevocation(callback: RevocationCallback) {
        this.#revocationCallback = callback;
    }

    handleEventSub(req: Request, res: Response) {
        if (!this.#verifySignature(req)) {
            console.warn('⚠️ Ungültige Twitch-Signatur');
            res.sendStatus(403);
            return;
        }
        if (this.#istZuAlt(req)) {
            console.warn('⚠️ Twitch-Nachricht zu alt (Replay?) - abgelehnt');
            res.sendStatus(403);
            return;
        }

        const body = JSON.parse(req.body.toString());
        const messageType = req.headers[TWITCH_MESSAGE_TYPE] as string;

        switch (messageType) {
            case MESSAGE_TYPE_VERIFICATION:
                console.log('Twitch Webhook verifiziert');
                res.status(200).send(body.challenge);
                break;

            case MESSAGE_TYPE_NOTIFICATION:
                res.sendStatus(204);
                if (this.#notificationCallback) {
                    this.#notificationCallback(body.event.broadcaster_user_id, body.event);
                }
                break;

            case MESSAGE_TYPE_REVOCATION:
                console.warn(`Subscription widerrufen: ${body.subscription.type} (${body.subscription.status})`);
                res.sendStatus(204);
                if (this.#revocationCallback) {
                    this.#revocationCallback(body.subscription.id, body.subscription.status);
                }
                break;

            default:
                res.sendStatus(204);
        }
    }

    start(port: number = 3000) {
        const server = this.#app.listen(port, () => {
            console.log(`Webhook-Server läuft auf Port ${port}`);
        });
        // Ohne diesen Handler verschwindet ein fehlgeschlagenes Bind (z.B. EADDRINUSE,
        // wenn ein alter Prozess den Port noch hält) lautlos: der Bot läuft weiter,
        // aber Twitch-Callbacks kommen nie an und Live-Meldungen brechen still weg.
        server.on('error', (error) => this.handleServerError(port, error));
        return server;
    }

    handleServerError(port: number, error: Error) {
        console.error(
            `❌ Webhook-Server konnte Port ${port} nicht binden - Twitch-Callbacks werden NICHT ankommen, Live-Meldungen brechen still weg:`,
            error
        );
    }

    // Timing-safe wie bei den Session-/CSRF-HMACs (config.session.ts) - das hier ist der einzige
    // ohne Login von außen erreichbare Endpoint, ausgerechnet hier darf der Vergleich nicht per
    // === Zeichen für Zeichen abbrechen. timingSafeEqual wirft bei ungleicher Länge, daher der
    // Längen-Check davor (leakt nur die öffentlich bekannte Signaturlänge).
    #verifySignature(req: Request): boolean {
        const messageId = req.headers[TWITCH_MESSAGE_ID];
        const timestamp = req.headers[TWITCH_MESSAGE_TIMESTAMP];
        const signature = req.headers[TWITCH_MESSAGE_SIGNATURE];
        if (typeof messageId !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string') {
            return false;
        }

        const message = messageId + timestamp + req.body.toString('utf8');
        const expectedSignature = 'sha256=' + createHmac('sha256', config.TWITCH_WEBHOOK_SECRET)
            .update(message)
            .digest('hex');

        const expected = Buffer.from(expectedSignature);
        const actual = Buffer.from(signature);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }

    // Erst NACH der Signaturprüfung aufrufen - ein unparsebarer/gefälschter Timestamp wäre dort
    // schon aussortiert (er ist Teil der signierten Nachricht). Zukunfts-Timestamps (Uhren-Skew)
    // gehen durch, nur zu alte Nachrichten nicht.
    #istZuAlt(req: Request): boolean {
        const zeit = Date.parse(req.headers[TWITCH_MESSAGE_TIMESTAMP] as string);
        return !Number.isFinite(zeit) || Date.now() - zeit > MAX_MESSAGE_AGE_MS;
    }

    #handleEventSub(req: Request, res: Response) {
        this.handleEventSub(req, res);
    }
}

export default new TwitchWebhookServer();