import config from '../../config.json' with {type: 'json'};

// Discord OAuth2 (Authorization Code Flow), Scope nur "identify" - wir wollen ausschliesslich
// die Discord-User-ID. Die eigentliche Admin-Pruefung macht danach unser eigener Bot ueber die
// gecachte Guild (siehe config.router.ts), nicht Discord. Netzcalls sind bewusst fehlertolerant
// (null statt throw), Muster wie twitch.service.getStreamInfo.

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';
const SCOPE = 'identify';

// Optionales Feld per Cast (Muster twitch.service.ts:10) - bricht die inferierte config.json-
// Typisierung nicht, wenn es (noch) fehlt. CLIENT_ID existiert bereits in der config.json.
const CLIENT_SECRET = (config as { DISCORD_CLIENT_SECRET?: string }).DISCORD_CLIENT_SECRET;

// Fail-closed: ohne Client-Secret kein OAuth (der Router verweigert dann das Login).
export function oauthConfigured(): boolean {
    return typeof CLIENT_SECRET === 'string' && CLIENT_SECRET.length > 0;
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
        client_id: config.CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPE,
        state
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Tauscht den Authorization-Code gegen ein Access-Token. null bei jedem Fehler.
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string | null> {
    try {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({
                client_id: config.CLIENT_ID,
                client_secret: CLIENT_SECRET as string,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
            }).toString()
        });
        if (!response.ok) {
            console.warn(`Discord-Token-Tausch fehlgeschlagen: HTTP ${response.status}`);
            return null;
        }
        const data = await response.json() as { access_token?: string };
        return data.access_token ?? null;
    } catch (error) {
        console.error('Fehler beim Discord-Token-Tausch:', error);
        return null;
    }
}

// Holt die Discord-User-ID zum Access-Token. null bei jedem Fehler.
export async function fetchDiscordUserId(accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(USER_URL, {
            headers: {Authorization: `Bearer ${accessToken}`}
        });
        if (!response.ok) {
            console.warn(`Discord-User-Abruf fehlgeschlagen: HTTP ${response.status}`);
            return null;
        }
        const data = await response.json() as { id?: string };
        return data.id ?? null;
    } catch (error) {
        console.error('Fehler beim Discord-User-Abruf:', error);
        return null;
    }
}
