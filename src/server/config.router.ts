import {Request, Response, Router} from 'express';
import {randomUUID} from 'crypto';
import {PermissionFlagsBits} from 'discord.js';
import config from '../../config.json' with {type: 'json'};
import client from '../client.js';
import {
    buildAuthorizeUrl,
    exchangeCodeForToken,
    fetchDiscordUserId,
    oauthConfigured
} from '../services/discordOAuth.service.js';
import {
    buildSetCookie,
    parseCookies,
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    sessionConfigured,
    signSession,
    STATE_COOKIE,
    verifySession
} from './config.session.js';
import {Einstellung, EinstellungStatus, sammleEinstellungen} from './config.settings.js';

// Verwaltungs-/Einstellungsseite (README-Todo), abgesichert per Discord-OAuth2-Login.
// Nur Server-Admins kommen rein: Discord liefert (Scope "identify") die User-ID, die
// Admin-Pruefung macht unser EIGENER Bot ueber die gecachte Guild (siehe pruefeAdmin).
//
// Kein Body-Parser noetig: Discord ruft den Callback als GET mit Query-Params (?code&state).
// Der Twitch-express.raw-Parser (nur auf /twitch) bleibt unberuehrt. Erst wenn /config
// spaeter Formulare bekommt, braucht es einen eigenen express.urlencoded NUR auf diesem Pfad.
//
// Session: zustandslos signiertes Cookie (siehe config.session.ts), kein Redis - gleiche
// Philosophie wie die Button-customIds. client wird nur in Funktionskoerpern benutzt (nicht
// auf Modul-Top-Level), damit die Zirkular-Import-Falle nicht greift (wie twitch.handler.ts).

// Optionales Feld per Cast (Muster twitch.service.ts). Redirect-URI muss exakt einer der im
// Discord Developer Portal hinterlegten Redirects sein. Secure-Cookie nur bei https.
const BASE_URL = (config as { CONFIG_BASE_URL?: string }).CONFIG_BASE_URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL}/config/callback`;
const COOKIE_SECURE = BASE_URL.startsWith('https');
const STATE_MAX_AGE_SECONDS = 600;

function authConfigured(): boolean {
    return oauthConfigured() && sessionConfigured();
}

function renderPage(bodyHtml: string): string {
    return `<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mechanischer Grüner Drache – Konfiguration</title>
    <style>
        :root { color-scheme: light dark; }
        body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
        h1 { font-size: 1.5rem; }
        a.button { display: inline-block; padding: 0.6rem 1rem; border-radius: 0.5rem; background: #5865F2; color: #fff; text-decoration: none; }
        a.logout { font-size: 0.9rem; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(128,128,128,0.3); }
        th { font-weight: 600; }
        td.wert { white-space: nowrap; }
        .status-ok { color: #2e7d32; }
        .status-warnung { color: #b26a00; }
        .status-leer { opacity: 0.6; }
        @media (prefers-color-scheme: dark) {
            .status-ok { color: #66bb6a; }
            .status-warnung { color: #ffb74d; }
        }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

// Pflicht: dynamische Werte (Kanal-/Rollen-Namen, Event-Titel) kommen aus User-/Discord-Daten und
// werden in HTML interpoliert - ohne Escaping waere das ein XSS-Vektor.
export function escapeHtml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const STATUS_SYMBOL: Record<EinstellungStatus, string> = {ok: '✓', warnung: '⚠', leer: '–'};

export function renderEinstellungen(einstellungen: Einstellung[]): string {
    const rows = einstellungen.map(e =>
        `<tr><td>${escapeHtml(e.label)}</td>` +
        `<td class="wert status-${e.status}">${STATUS_SYMBOL[e.status]} ${escapeHtml(e.wert)}</td></tr>`
    ).join('\n');
    return `<table>
        <thead><tr><th>Einstellung</th><th>Aktueller Wert</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function configBody(einstellungenHtml: string): string {
    return `<h1>Mechanischer Grüner Drache</h1>
    <p>Aktuelle Bot-Einstellungen (nur Ansicht – das Bearbeiten kommt als nächster Schritt).</p>
    ${einstellungenHtml}
    <p><a class="logout" href="/config/logout">Abmelden</a></p>`;
}

const LOGIN_BODY = `<h1>Mechanischer Grüner Drache</h1>
    <p>Die Verwaltungsseite ist nur für Server-Admins.</p>
    <p><a class="button" href="/config/login">Mit Discord anmelden</a></p>`;

const NOT_CONFIGURED_BODY = `<h1>Anmeldung nicht verfügbar</h1>
    <p>Der Discord-Login ist auf diesem Server noch nicht konfiguriert
    (<code>DISCORD_CLIENT_SECRET</code> und <code>CONFIG_SESSION_SECRET</code> fehlen).</p>`;

function forbiddenBody(grund: string): string {
    return `<h1>Kein Zugriff</h1>
    <p>${grund}</p>
    <p><a class="logout" href="/config">Zurück</a></p>`;
}

// Admin-Pruefung ueber den eigenen Bot: nur wer auf der konfigurierten Guild Administrator ist,
// kommt rein. Ein-Zeilen-Umschaltpunkt fuer Rollen-Gating: statt permissions.has(...) hier
// member.roles.cache.has(ROLLEN_ID) verwenden.
async function pruefeAdmin(userId: string): Promise<boolean> {
    try {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        if (!guild) {
            console.warn('Config-Login: konfigurierte Guild nicht im Cache.');
            return false;
        }
        const member = await guild.members.fetch(userId);
        return member.permissions.has(PermissionFlagsBits.Administrator);
    } catch (error) {
        // members.fetch wirft auch, wenn die Person gar nicht (mehr) auf dem Server ist.
        console.warn('Config-Login: Admin-Pruefung fehlgeschlagen:', error);
        return false;
    }
}

// Middleware: nur mit gueltigem Session-Cookie UND aktuell noch bestehenden Admin-Rechten weiter,
// sonst Login-Seite. Fail-closed, wenn der OAuth-Login gar nicht konfiguriert ist.
export async function requireConfigAuth(req: Request, res: Response, next: () => void): Promise<void> {
    if (!authConfigured()) {
        res.status(503).type('html').send(renderPage(NOT_CONFIGURED_BODY));
        return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const userId = verifySession(cookies[SESSION_COOKIE]);
    if (!userId) {
        res.type('html').send(renderPage(LOGIN_BODY));
        return;
    }
    // Frische Admin-Pruefung bei JEDEM Aufruf, nicht nur beim Login: verliert jemand die
    // Admin-Rolle oder verlaesst den Server, ist er sofort ausgesperrt statt erst nach Cookie-Ablauf.
    // Das tote Cookie wird dabei gleich geloescht (sonst loest es bei jedem Request erneut ein fetch aus).
    if (!(await pruefeAdmin(userId))) {
        res.setHeader('Set-Cookie', buildSetCookie(SESSION_COOKIE, '', 0, COOKIE_SECURE));
        res.type('html').send(renderPage(LOGIN_BODY));
        return;
    }
    next();
}

export async function handleConfigPage(_req: Request, res: Response): Promise<void> {
    let inhalt: string;
    try {
        inhalt = renderEinstellungen(await sammleEinstellungen());
    } catch (error) {
        // Ein Redis-/Discord-Problem darf die Seite nicht komplett kosten - lieber ein Hinweis.
        console.error('Fehler beim Laden der Config-Einstellungen:', error);
        inhalt = '<p>Die Einstellungen konnten gerade nicht geladen werden.</p>';
    }
    res.type('html').send(renderPage(configBody(inhalt)));
}

// Startet den OAuth-Flow: zufaelligen state als kurzlebiges Cookie setzen (CSRF, Double-Submit)
// und zu Discord weiterleiten.
export function handleLogin(_req: Request, res: Response): void {
    if (!authConfigured()) {
        res.status(503).type('html').send(renderPage(NOT_CONFIGURED_BODY));
        return;
    }
    const state = randomUUID();
    res.setHeader('Set-Cookie', buildSetCookie(STATE_COOKIE, state, STATE_MAX_AGE_SECONDS, COOKIE_SECURE));
    res.redirect(buildAuthorizeUrl(state, REDIRECT_URI));
}

// Discord leitet hierher zurueck: state pruefen, Code gegen Token tauschen, User-ID holen,
// Admin-Pruefung, dann Session-Cookie setzen und auf /config leiten.
export async function handleCallback(req: Request, res: Response): Promise<void> {
    if (!authConfigured()) {
        res.status(503).type('html').send(renderPage(NOT_CONFIGURED_BODY));
        return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const stateCookie = cookies[STATE_COOKIE];
    const stateParam = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';

    if (!stateCookie || !stateParam || stateCookie !== stateParam) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiger Anmeldeversuch (state stimmt nicht).')));
        return;
    }
    if (!code) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Kein Anmelde-Code von Discord erhalten.')));
        return;
    }

    const token = await exchangeCodeForToken(code, REDIRECT_URI);
    const userId = token ? await fetchDiscordUserId(token) : null;
    if (!userId) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Anmeldung bei Discord fehlgeschlagen.')));
        return;
    }

    if (!(await pruefeAdmin(userId))) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Du bist auf diesem Server kein Administrator.')));
        return;
    }

    res.setHeader('Set-Cookie', [
        buildSetCookie(SESSION_COOKIE, signSession(userId), SESSION_MAX_AGE_SECONDS, COOKIE_SECURE),
        buildSetCookie(STATE_COOKIE, '', 0, COOKIE_SECURE)
    ]);
    res.redirect('/config');
}

export function handleLogout(_req: Request, res: Response): void {
    res.setHeader('Set-Cookie', buildSetCookie(SESSION_COOKIE, '', 0, COOKIE_SECURE));
    res.redirect('/config');
}

const configRouter = Router();
// requireConfigAuth ist async (frische Admin-Pruefung) - eigenes .catch als Sicherheitsnetz,
// obwohl pruefeAdmin selbst schon alle Fehler abfaengt (kein unhandled reject).
configRouter.get('/config', (req, res, next) => {
    requireConfigAuth(req, res, next).catch((error) => {
        console.error('Fehler in requireConfigAuth:', error);
        if (!res.headersSent) {
            res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
        }
    });
}, (req, res) => {
    // handleConfigPage ist async (sammelt Einstellungen) - eigenes .catch, auch wenn es intern faengt.
    handleConfigPage(req, res).catch((error) => {
        console.error('Fehler beim Rendern der Config-Seite:', error);
        if (!res.headersSent) {
            res.status(500).type('html').send(renderPage('<p>Interner Fehler.</p>'));
        }
    });
});
configRouter.get('/config/login', handleLogin);
// async void: eigenes .catch, sonst killt eine unhandled rejection den Prozess (siehe CLAUDE.md).
configRouter.get('/config/callback', (req, res) => {
    handleCallback(req, res).catch((error) => {
        console.error('Fehler im Config-OAuth-Callback:', error);
        if (!res.headersSent) {
            res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
        }
    });
});
configRouter.get('/config/logout', handleLogout);

export default configRouter;
