import {createHmac, timingSafeEqual} from 'crypto';
import config from '../../config.json' with {type: 'json'};

// Zustandslos signiertes Session-Cookie fuer die Config-Seite: HMAC ueber "userId|expiry",
// geprueft mit timingSafeEqual. Kein Redis - dieselbe Philosophie wie die zustandslos
// signierten Button-customIds (ueberlebt Neustarts, nichts zu speichern). Cookies werden
// bewusst nativ gebaut/geparst (kein cookie-parser/express-session), im minimal-deps-Stil
// des Projekts (wie das manuelle HTML-Parsing in news.service).

// Optionales Config-Feld per Cast lesen (Muster aus twitch.service.ts), damit die aus der
// config.json inferierte Typisierung nicht bricht, wenn das Feld (noch) fehlt.
const SESSION_SECRET = (config as { CONFIG_SESSION_SECRET?: string }).CONFIG_SESSION_SECRET;

export const SESSION_COOKIE = 'config_session';
export const STATE_COOKIE = 'config_oauth_state';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// Fail-closed: ohne gesetztes Secret gibt es keine gueltigen Sessions (und der Router
// verweigert das Login, statt mit leerem/bekanntem Schluessel faelschbare Cookies zu bauen).
export function sessionConfigured(): boolean {
    return typeof SESSION_SECRET === 'string' && SESSION_SECRET.length > 0;
}

function hmac(payload: string): string {
    return createHmac('sha256', SESSION_SECRET as string).update(payload).digest('hex');
}

export function signSession(userId: string): string {
    if (!sessionConfigured()) {
        throw new Error('CONFIG_SESSION_SECRET ist nicht gesetzt - Session kann nicht signiert werden.');
    }
    const expiry = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
    const payload = `${userId}.${expiry}`;
    return `${payload}.${hmac(payload)}`;
}

// Gibt die userId zurueck, wenn Signatur gueltig UND nicht abgelaufen - sonst null.
export function verifySession(value: string | undefined): string | null {
    if (!value || !sessionConfigured()) {
        return null;
    }
    // userId ist eine numerische Discord-ID (keine Punkte), expiry numerisch -> genau 3 Teile.
    const parts = value.split('.');
    if (parts.length !== 3) {
        return null;
    }
    const [userId, expiryRaw, signature] = parts;
    const expected = hmac(`${userId}.${expiryRaw}`);
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');
    // timingSafeEqual wirft bei ungleicher Laenge - vorher pruefen (der Laengen-Check selbst
    // leakt nur die - oeffentlich bekannte - Signaturlaenge, nicht das Secret).
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        return null;
    }
    const expiry = Number(expiryRaw);
    if (!Number.isFinite(expiry) || expiry < Date.now()) {
        return null;
    }
    return userId;
}

// CSRF-Token fuer Bearbeiten-Formulare: zustandslos aus der User-ID abgeleitet (HMAC mit demselben
// Secret wie die Session) - kein Redis, kein Formular-State. Ein fremder Angreifer kann es weder
// erraten noch auslesen (Same-Origin-Policy); zusammen mit SameSite=Lax am Session-Cookie ist das
// fuer ein Admin-Panel ausreichend.
//
// Aufbau wie signSession: "<ablauf>.<hmac>". Bis 2026-07-26 war es ein reiner HMAC ueber die User-ID,
// also fuer die Lebensdauer des Secrets *unveraenderlich* gueltig - ein einmal mitgelesenes Token
// (Screenshot des Seitenquelltexts, Browser-Erweiterung) haette nie aufgehoert zu gelten. Die
// Gueltigkeit ist deshalb begrenzt; dieselbe Dauer wie die Session, damit ein offener Tab nicht
// vorzeitig in ein 403 laeuft (laenger als die Session kann es nichts nuetzen - ohne gueltige
// Session kommt der Request gar nicht bis zur CSRF-Pruefung).
export const CSRF_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

export function createCsrfToken(userId: string): string {
    if (!sessionConfigured()) {
        throw new Error('CONFIG_SESSION_SECRET ist nicht gesetzt - CSRF-Token kann nicht erzeugt werden.');
    }
    const ablauf = Date.now() + CSRF_MAX_AGE_SECONDS * 1000;
    return `${ablauf}.${hmac(`csrf:${userId}.${ablauf}`)}`;
}

export function verifyCsrfToken(userId: string, token: string | undefined): boolean {
    if (!token || !sessionConfigured()) {
        return false;
    }
    const [ablaufRaw, signatur] = token.split('.');
    if (!ablaufRaw || !signatur) {
        return false;
    }
    const expected = Buffer.from(hmac(`csrf:${userId}.${ablaufRaw}`), 'hex');
    const actual = Buffer.from(signatur, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return false;
    }
    // Erst nach der Signaturpruefung: ein gefaelschter Ablauf ist damit schon aussortiert.
    const ablauf = Number(ablaufRaw);
    return Number.isFinite(ablauf) && ablauf >= Date.now();
}

// Manuelles Parsen von req.headers.cookie ("a=1; b=2") - spart die cookie-parser-Dependency.
export function parseCookies(header: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) {
        return cookies;
    }
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) {
            continue;
        }
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (name) {
            cookies[name] = value;
        }
    }
    return cookies;
}

// Set-Cookie-String bauen. Path=/config, damit die Cookies nur an den Config-Bereich gehen
// (nicht an /twitch). Secure nur bei https (sonst verwirft der Browser das Cookie auf http-localhost).
// maxAgeSeconds = 0 loescht das Cookie.
export function buildSetCookie(
    name: string,
    value: string,
    maxAgeSeconds: number,
    secure: boolean
): string {
    const attrs = [
        `${name}=${value}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/config',
        `Max-Age=${maxAgeSeconds}`
    ];
    if (secure) {
        attrs.push('Secure');
    }
    return attrs.join('; ');
}
