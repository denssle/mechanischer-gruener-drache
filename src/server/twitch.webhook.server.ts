import express, {Request, Response} from 'express';
import {createHmac} from 'crypto';
import config from '../../config.json' with {type: 'json'};
import {StreamOnlineEvent} from "../types/steamOnlineEvent.js";

const TWITCH_MESSAGE_ID = 'twitch-eventsub-message-id';
const TWITCH_MESSAGE_TIMESTAMP = 'twitch-eventsub-message-timestamp';
const TWITCH_MESSAGE_SIGNATURE = 'twitch-eventsub-message-signature';
const TWITCH_MESSAGE_TYPE = 'twitch-eventsub-message-type';

const MESSAGE_TYPE_VERIFICATION = 'webhook_callback_verification';
const MESSAGE_TYPE_NOTIFICATION = 'notification';
const MESSAGE_TYPE_REVOCATION = 'revocation';

type NotificationCallback = (twitchUserId: string, streamData: StreamOnlineEvent) => void;

class TwitchWebhookServer {
    #app = express();
    #notificationCallback: NotificationCallback | null = null;

    constructor() {
        this.#app.use('/twitch', express.raw({type: 'application/json'}));
        this.#app.post('/twitch/eventsub', (req: Request, res: Response) => {
            this.#handleEventSub(req, res);
        });
    }

    onNotification(callback: NotificationCallback) {
        this.#notificationCallback = callback;
    }

    start(port: number = 3000) {
        this.#app.listen(port, () => {
            console.log(`Webhook-Server läuft auf Port ${port}`);
        });
    }

    #verifySignature(req: Request): boolean {
        const messageId = req.headers[TWITCH_MESSAGE_ID] as string;
        const timestamp = req.headers[TWITCH_MESSAGE_TIMESTAMP] as string;
        const signature = req.headers[TWITCH_MESSAGE_SIGNATURE] as string;

        const message = messageId + timestamp + req.body;
        const expectedSignature = 'sha256=' + createHmac('sha256', config.TWITCH_WEBHOOK_SECRET)
            .update(message)
            .digest('hex');

        return expectedSignature === signature;
    }

    #handleEventSub(req: Request, res: Response) {
        if (!this.#verifySignature(req)) {
            console.warn('⚠️ Ungültige Twitch-Signatur');
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
                console.warn(`Subscription widerrufen: ${body.subscription.type}`);
                res.sendStatus(204);
                break;

            default:
                res.sendStatus(204);
        }
    }
}

export default new TwitchWebhookServer();