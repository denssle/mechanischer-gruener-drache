import config from '../../config.json' with {type: 'json'};
import {TwitchAccessToken} from "../types/twitchAccessToken.js";
import {TwitchUser} from "../types/twitchUser.js";
import {EventSubSubscription} from "../types/eventSubSubscription.js";
import {TwitchStream} from "../types/twitchStream.js";

const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const DEFAULT_WEBHOOK_CALLBACK_URL = 'https://enzlor.uber.space/twitch/eventsub';
const WEBHOOK_CALLBACK_URL = (config as { TWITCH_WEBHOOK_CALLBACK_URL?: string }).TWITCH_WEBHOOK_CALLBACK_URL
    ?? DEFAULT_WEBHOOK_CALLBACK_URL;

class TwitchService {
    #accessToken: string | null = null;
    #tokenExpiry: number = 0;

    async #getAccessToken(): Promise<string> {
        if (this.#accessToken && Date.now() < this.#tokenExpiry) {
            return this.#accessToken;
        }

        const response = await fetch(TWITCH_AUTH_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({
                client_id: config.TWITCH_CLIENT_ID,
                client_secret: config.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials',
            }),
        });

        if (!response.ok) {
            throw new Error(`Twitch Auth fehlgeschlagen: ${response.statusText}`);
        }

        const data = await response.json() as TwitchAccessToken;
        this.#accessToken = data.access_token;
        this.#tokenExpiry = Date.now() + (data.expires_in - 3600) * 1000;
        console.log('✅ Twitch Access Token erneuert');
        return this.#accessToken;
    }

    async #twitchRequest(path: string, options: RequestInit = {}): Promise<Response> {
        const token = await this.#getAccessToken();
        return fetch(`${TWITCH_API_BASE}${path}`, {
            ...options,
            headers: {
                'Client-Id': config.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });
    }

    async getUserByLogin(login: string): Promise<TwitchUser | null> {
        const response = await this.#twitchRequest(`/users?login=${login}`);

        if (!response.ok) {
            console.error(`Fehler beim Abrufen des Twitch-Users: ${response.statusText}`);
            return null;
        }

        const data = await response.json() as { data: TwitchUser[] };
        return data.data[0] ?? null;
    }

    // Aktuelle Stream-Infos (Spiel/Kategorie + Titel) - das stream.online-Event selbst
    // liefert die nicht mit. Bewusst fehlertolerant (fängt alles ab und gibt null zurück),
    // weil das nur eine Anreicherung der Live-Meldung ist und die niemals blockieren darf.
    // Direkt beim Live-Gehen kann Twitch hier noch nichts/eine leere Liste liefern -> null.
    async getStreamInfo(twitchUserId: string): Promise<TwitchStream | null> {
        try {
            const response = await this.#twitchRequest(`/streams?user_id=${twitchUserId}`);

            if (!response.ok) {
                console.error(`Fehler beim Abrufen der Stream-Infos: ${response.statusText}`);
                return null;
            }

            const data = await response.json() as { data: TwitchStream[] };
            return data.data[0] ?? null;
        } catch (error) {
            console.error('Fehler beim Abrufen der Stream-Infos:', error);
            return null;
        }
    }

    async subscribeToStreamOnline(twitchUserId: string): Promise<string | null> {
        const response = await this.#twitchRequest('/eventsub/subscriptions', {
            method: 'POST',
            body: JSON.stringify({
                type: 'stream.online',
                version: '1',
                condition: {broadcaster_user_id: twitchUserId},
                transport: {
                    method: 'webhook',
                    callback: WEBHOOK_CALLBACK_URL,
                    secret: config.TWITCH_WEBHOOK_SECRET,
                },
            }),
        });

        if (!response.ok) {
            console.error(`Fehler beim Registrieren der EventSub-Subscription: ${response.statusText}`);
            return null;
        }

        const data = await response.json() as { data: EventSubSubscription[] };
        const subscriptionId = data.data[0]?.id ?? null;
        console.log(`✅ EventSub-Subscription registriert: ${subscriptionId}`);
        return subscriptionId;
    }

    async listStreamOnlineSubscriptions(): Promise<EventSubSubscription[]> {
        const response = await this.#twitchRequest('/eventsub/subscriptions?type=stream.online');

        if (!response.ok) {
            console.error(`Fehler beim Abrufen der EventSub-Subscriptions: ${response.statusText}`);
            return [];
        }

        const data = await response.json() as { data: EventSubSubscription[] };
        return data.data ?? [];
    }

    async unsubscribeFromStreamOnline(subscriptionId: string): Promise<boolean> {
        const response = await this.#twitchRequest(`/eventsub/subscriptions?id=${subscriptionId}`, {
            method: 'DELETE',
        });

        if (response.status === 404) {
            console.warn(`⚠️ EventSub-Subscription ${subscriptionId} war bei Twitch bereits nicht mehr vorhanden`);
            return true;
        }

        if (!response.ok) {
            console.error(`Fehler beim Löschen der EventSub-Subscription: ${response.statusText}`);
            return false;
        }

        console.log(`✅ EventSub-Subscription gelöscht: ${subscriptionId}`);
        return true;
    }
}

export default new TwitchService();
