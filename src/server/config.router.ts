import {Request, Response, Router, urlencoded} from 'express';
import {randomUUID} from 'crypto';
import {PermissionFlagsBits} from 'discord.js';
import config from '../../config.json' with {type: 'json'};
import client from '../client.js';
import greetingHandler from '../handlers/greeting.handler.js';
import {
    buildAuthorizeUrl,
    exchangeCodeForToken,
    fetchDiscordUserId,
    oauthConfigured
} from '../services/discordOAuth.service.js';
import {
    buildSetCookie,
    createCsrfToken,
    parseCookies,
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    sessionConfigured,
    signSession,
    STATE_COOKIE,
    verifyCsrfToken,
    verifySession
} from './config.session.js';
import {SportMilestone} from '../types/sport.js';
import {
    addiereLegacyKilometer,
    Einstellung,
    EinstellungStatus,
    entferneEvent,
    entferneMeilenstein,
    EventFelder,
    holeEventFelder,
    holeLegacyKilometer,
    holeMeilensteine,
    holeMitglieder,
    holeRollen,
    holeTextKanaele,
    holeTwitchRolleId,
    istGueltigerTextKanal,
    istGueltigeRolle,
    istGueltigesMitglied,
    istKanalFeld,
    KanalFeld,
    KanalOption,
    ladeKanalFelder,
    MitgliedOption,
    RollenOption,
    sammleEinstellungen,
    setzeLegacyKilometer,
    speichereEventDaten,
    speichereKanal,
    speichereKilometer,
    speichereTwitchRolle
} from './config.settings.js';

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
        form.setting { display: flex; align-items: center; gap: 0.75rem; margin: 0.4rem 0; flex-wrap: wrap; }
        form.setting label { flex: 0 0 16rem; }
        form.setting select { flex: 0 0 14rem; padding: 0.3rem; }
        form.setting button { padding: 0.3rem 0.8rem; }
        form.setting input { padding: 0.3rem; }
        form.rolle-abstand { margin-top: 0.9rem; }
        fieldset.bereich { border: 1px solid rgba(128,128,128,0.4); border-radius: 0.6rem; padding: 0.4rem 1.25rem 1rem; margin: 1.1rem 0; }
        fieldset.bereich legend { font-weight: 600; font-size: 1.05rem; padding: 0 0.4rem; }
        form.event-form { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin: 0.4rem 0; }
        form.event-form input { padding: 0.3rem; }
        form.event-form input[type="text"] { flex: 1; min-width: 8rem; }
        form.event-form button { padding: 0.3rem 0.8rem; }
        p.meilenstein-titel { margin: 0.9rem 0 0.3rem; }
        ul.meilensteine { list-style: none; padding: 0; margin: 0.3rem 0; }
        li.meilenstein { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.35rem 0; border-bottom: 1px solid rgba(128,128,128,0.2); }
        li.meilenstein form { margin: 0; }
        li.meilenstein button { padding: 0.2rem 0.7rem; }
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

// Ein Bearbeiten-Formular für eine Kanal-Einstellung. Auswahl statt Freitext-ID - die Liste kommt aus
// dem Bot und dient zugleich als Whitelist bei der Validierung. CSRF-Token + Feld-Kennung als hidden
// fields. Sind keine Kanäle da (Bot nicht auf dem Server?), zeigt das Dropdown einen Hinweis.
export function renderKanalFormular(feld: KanalFeld, kanaele: KanalOption[], csrfToken: string): string {
    if (!kanaele.length) {
        return `<p>${escapeHtml(feld.label)}: keine Text-Kanäle gefunden.</p>`;
    }
    const optionen = kanaele.map(kanal =>
        `<option value="${escapeHtml(kanal.id)}"${kanal.id === feld.aktuelleId ? ' selected' : ''}>#${escapeHtml(kanal.name)}</option>`
    ).join('\n');
    return `<form class="setting" method="post" action="/config/kanal">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="feld" value="${escapeHtml(feld.schluessel)}">
        <label>${escapeHtml(feld.label)}</label>
        <select name="kanal">${optionen}</select>
        <button type="submit">Speichern</button>
    </form>`;
}

// Twitch-Benachrichtigungsrolle: wie ein Kanal-Feld, aber die Rolle ist optional -> eine
// "— keine —"-Option (leerer Wert) zum Entfernen. `aktuelleId === null` heisst "keine gesetzt".
export function renderRollenFormular(rollen: RollenOption[], aktuelleId: string | null, csrfToken: string): string {
    const keineOption = `<option value=""${aktuelleId === null ? ' selected' : ''}>— keine —</option>`;
    const optionen = rollen.map(rolle =>
        `<option value="${escapeHtml(rolle.id)}"${rolle.id === aktuelleId ? ' selected' : ''}>@${escapeHtml(rolle.name)}</option>`
    ).join('\n');
    return `<form class="setting rolle-abstand" method="post" action="/config/rolle">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label>Twitch-Benachrichtigungsrolle</label>
        <select name="rolle">${keineOption}${optionen}</select>
        <button type="submit">Speichern</button>
    </form>`;
}

// Baut aus nativen <input type="date"> (YYYY-MM-DD) + <input type="time"> (HH:MM, optional) einen
// Unix-Timestamp (ms) in lokaler TZ (Host = Europe/Berlin). null bei ungültigem/inkonsistentem
// Datum - Round-Trip-Check wie parseGermanDateTime, damit z.B. 2026-02-31 nicht still normalisiert.
export function parseIsoDateTime(datum: string, uhrzeit: string): number | null {
    const d = datum.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!d) {
        return null;
    }
    let stunden = 0;
    let minuten = 0;
    if (uhrzeit.trim()) {
        const t = uhrzeit.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!t) {
            return null;
        }
        stunden = Number(t[1]);
        minuten = Number(t[2]);
        if (stunden > 23 || minuten > 59) {
            return null;
        }
    }
    const jahr = Number(d[1]);
    const monat = Number(d[2]);
    const tag = Number(d[3]);
    const date = new Date(jahr, monat - 1, tag, stunden, minuten, 0, 0);
    if (date.getFullYear() !== jahr || date.getMonth() !== monat - 1 || date.getDate() !== tag) {
        return null;
    }
    return date.getTime();
}

// Event-Formular: native Datums-/Zeit-Felder (kein Dropdown) + optionaler Titel. Zwei Submit-Buttons
// (Speichern/Entfernen) über name="aktion"; "Entfernen" ist formnovalidate, damit es auch ohne
// ausgefülltes (required) Datum abschickbar ist.
export function renderEventFormular(felder: EventFelder, csrfToken: string): string {
    return `<form class="event-form" method="post" action="/config/event">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="date" name="datum" value="${escapeHtml(felder.datum)}" required aria-label="Datum" title="Datum">
        <input type="time" name="uhrzeit" value="${escapeHtml(felder.uhrzeit)}" aria-label="Uhrzeit (optional)" title="Uhrzeit (optional)">
        <input type="text" name="titel" placeholder="Titel (optional)" maxlength="100" value="${escapeHtml(felder.titel)}" aria-label="Titel">
        <button type="submit" name="aktion" value="speichern">Speichern</button>
        <button type="submit" name="aktion" value="entfernen" formnovalidate>Event entfernen</button>
    </form>`;
}

// Sport-Admin-Formulare: Kilometerstand eines Mitglieds setzen (Mitglied-Dropdown = Whitelist) und
// Bestandskilometer (Addieren / Setzen; 0 = entfernen). Alle posten an /config/sport mit name="aktion".
export function renderSportAdmin(mitglieder: MitgliedOption[], legacyKilometer: number, csrfToken: string): string {
    const mitgliedFeld = mitglieder.length
        ? `<select name="mitglied">${mitglieder.map(m =>
            `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('\n')}</select>`
        : '<span class="status-leer">keine Mitglieder gefunden</span>';
    return `<form class="setting" method="post" action="/config/sport">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="aktion" value="kilometer-setzen">
        <label>Kilometerstand eines Mitglieds setzen</label>
        ${mitgliedFeld}
        <input type="number" name="kilometer" min="0" step="0.01" placeholder="km" required aria-label="Kilometer">
        <button type="submit">Setzen</button>
    </form>
    <form class="setting" method="post" action="/config/sport">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label>Bestandskilometer (aktuell ${legacyKilometer} km)</label>
        <input type="number" name="kilometer" min="0" step="0.01" placeholder="km" required aria-label="Bestandskilometer">
        <button type="submit" name="aktion" value="altkilometer-addieren">Addieren</button>
        <button type="submit" name="aktion" value="altkilometer-setzen">Setzen (0 = entfernen)</button>
    </form>`;
}

// Meilenstein-Liste mit je einem Entfernen-Button. Anlegen bleibt bewusst der (für alle offene)
// Command /sport meilenstein setzen - hier nur die Admin-Verwaltung (anzeigen + entfernen).
export function renderMeilensteinListe(meilensteine: SportMilestone[], csrfToken: string): string {
    if (!meilensteine.length) {
        return '<p class="status-leer">Noch keine Meilensteine angelegt (anlegen per <code>/sport meilenstein setzen</code>).</p>';
    }
    const zeilen = [...meilensteine]
        .sort((a, b) => a.kilometers - b.kilometers)
        .map(m => {
            const vorschau = m.text.replace(/\s+/g, ' ').trim();
            const gekuerzt = vorschau.length > 60 ? `${vorschau.slice(0, 60)}…` : vorschau;
            return `<li class="meilenstein">
            <span><strong>${m.kilometers} km</strong> – ${escapeHtml(gekuerzt)}${m.announced ? ' <em>(angekündigt)</em>' : ''}</span>
            <form method="post" action="/config/sport">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="aktion" value="meilenstein-entfernen">
                <input type="hidden" name="kilometer" value="${m.kilometers}">
                <button type="submit">Entfernen</button>
            </form>
        </li>`;
        }).join('\n');
    return `<p class="meilenstein-titel"><strong>Meilensteine</strong> (Anlegen per <code>/sport meilenstein setzen</code>):</p>
    <ul class="meilensteine">${zeilen}</ul>`;
}

// Morgengruß: Button, der den Historien-Scan für die persönlichen Emojis anstößt (früher
// /morgengruss lernen). Der Kanal wird oben im selben Bereich gesetzt; ist keiner da, meldet das der
// Handler nach dem Klick. Der Scan kostet ein paar API-Calls, die POST-Antwort blockt so lange.
export function renderMorgengrussLernen(csrfToken: string): string {
    return `<form class="setting" method="post" action="/config/morgengruss">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label>Persönliche Emojis aus der Chat-Historie lernen</label>
        <button type="submit">Jetzt lernen</button>
    </form>`;
}

// hinweis ist ein vollständig von uns kontrollierter Text (kein User-Input, keine Escaping-Pflicht) -
// die Zahl beim Lernen wird in handleConfigPage bewusst zu Number gecastet, damit da nichts Rohes
// aus der Query landet.
function configBody(einstellungenHtml: string, bereicheHtml: string, gespeichert: boolean, hinweis?: string): string {
    return `<h1>Mechanischer Grüner Drache</h1>
    <p>Aktuelle Bot-Einstellungen im Überblick, darunter nach Bereich gruppiert zum Bearbeiten.</p>
    ${gespeichert ? '<p class="status-ok">Gespeichert.</p>' : ''}
    ${hinweis ? `<p class="status-ok">${hinweis}</p>` : ''}
    ${einstellungenHtml}
    <h2>Bearbeiten</h2>
    ${bereicheHtml}
    <p><a class="logout" href="/config/logout">Abmelden</a></p>`;
}

export interface ConfigSeiteDaten {
    einstellungen: Einstellung[];
    kanalFelder: KanalFeld[];
    kanaele: KanalOption[];
    rollen: RollenOption[];
    twitchRolleId: string | null;
    eventFelder: EventFelder;
    mitglieder: MitgliedOption[];
    legacyKilometer: number;
    meilensteine: SportMilestone[];
    csrfToken: string;
    gespeichert: boolean;
    hinweis?: string;
}

// Ein fachlich abgegrenzter Bereich als <fieldset> (semantisch die Formular-Gruppierung),
// die <legend> ist die Bereichs-Überschrift.
function renderBereich(titel: string, inhaltHtml: string): string {
    return `<fieldset class="bereich">
        <legend>${escapeHtml(titel)}</legend>
        ${inhaltHtml}
    </fieldset>`;
}

// Reine Präsentation der kompletten /config-Seite - KEINE Redis-/Discord-Zugriffe. handleConfigPage
// sammelt die Daten und ruft das hier; das Vorschau-Skript (scripts/config-vorschau.ts) ruft es mit
// Beispieldaten auf, um am Layout zu iterieren, ohne zu deployen.
export function renderConfigSeite(daten: ConfigSeiteDaten): string {
    const csrf = daten.csrfToken;
    const kanal = (schluessel: string): string => {
        const feld = daten.kanalFelder.find(f => f.schluessel === schluessel);
        return feld ? renderKanalFormular(feld, daten.kanaele, csrf) : '';
    };
    // Nach Feature gruppiert, damit fachlich Zusammengehöriges zusammensteht.
    const bereiche =
        renderBereich('Twitch', kanal('twitch-kanal') + renderRollenFormular(daten.rollen, daten.twitchRolleId, csrf)) +
        renderBereich('Sport', kanal('sport-kanal') + renderSportAdmin(daten.mitglieder, daten.legacyKilometer, csrf) + renderMeilensteinListe(daten.meilensteine, csrf)) +
        renderBereich('Nachrichten-Protokoll', kanal('protokoll')) +
        renderBereich('Morgengruß', kanal('morgengruss-kanal') + renderMorgengrussLernen(csrf)) +
        renderBereich('Event', renderEventFormular(daten.eventFelder, csrf));
    return renderPage(configBody(renderEinstellungen(daten.einstellungen), bereiche, daten.gespeichert, daten.hinweis));
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
    // Fuer nachgelagerte Handler: wer ist eingeloggt (Basis des CSRF-Tokens).
    res.locals.configUserId = userId;
    next();
}

// Rückmeldung des Morgengruß-Lernen-Buttons (Post/Redirect/Get). Die Zahl bewusst zu Number casten,
// nicht die rohe Query interpolieren (sonst XSS über ?gelernt=). null-Kanal-Fall verweist nach oben.
function morgengrussHinweis(req: Request): string | undefined {
    const gelernt = Number(req.query.gelernt);
    if (typeof req.query.gelernt === 'string' && Number.isFinite(gelernt)) {
        return `Aus der Historie habe ich ${gelernt} persönliche Emojis gelernt.`;
    }
    if (req.query.morgengruss === 'kein-kanal') {
        return 'Es ist kein (abrufbarer) Morgengruß-Kanal gesetzt. Setze ihn zuerst oben im Bereich „Morgengruß".';
    }
    return undefined;
}

export async function handleConfigPage(req: Request, res: Response): Promise<void> {
    try {
        const userId = res.locals.configUserId as string;
        const html = renderConfigSeite({
            einstellungen: await sammleEinstellungen(),
            kanalFelder: await ladeKanalFelder(),
            kanaele: holeTextKanaele(),
            rollen: holeRollen(),
            twitchRolleId: await holeTwitchRolleId(),
            eventFelder: await holeEventFelder(),
            mitglieder: holeMitglieder(),
            legacyKilometer: await holeLegacyKilometer(),
            meilensteine: await holeMeilensteine(),
            csrfToken: createCsrfToken(userId),
            gespeichert: req.query.gespeichert === '1',
            hinweis: morgengrussHinweis(req),
        });
        res.type('html').send(html);
    } catch (error) {
        // Ein Redis-/Discord-Problem darf die Seite nicht komplett kosten - lieber ein Hinweis.
        console.error('Fehler beim Laden der Config-Einstellungen:', error);
        res.type('html').send(renderPage(configBody('<p>Die Einstellungen konnten gerade nicht geladen werden.</p>', '', false)));
    }
}

// Speichert einen Kanal fuer die per "feld" benannte Einstellung. Reihenfolge bewusst: CSRF pruefen,
// dann Feld-Kennung UND Kanal-ID gegen ihre jeweilige Whitelist validieren, erst dann schreiben.
// Danach Redirect (Post/Redirect/Get), damit ein Reload im Browser nicht erneut speichert.
export async function handleKanalSpeichern(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    const feld = typeof body.feld === 'string' ? body.feld : '';
    if (!istKanalFeld(feld)) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekannte Einstellung.')));
        return;
    }

    const kanalId = typeof body.kanal === 'string' ? body.kanal : '';
    if (!istGueltigerTextKanal(kanalId)) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekannter Kanal – bitte einen Kanal aus der Liste wählen.')));
        return;
    }

    await speichereKanal(feld, kanalId);
    res.redirect('/config?gespeichert=1');
}

// Speichert die Twitch-Benachrichtigungsrolle. Leerer Wert = Rolle entfernen (sie ist optional).
// Sonst gegen die Rollen-Whitelist validieren. CSRF wie ueberall zuerst.
export async function handleRolleSpeichern(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    const rolleId = typeof body.rolle === 'string' ? body.rolle : '';
    if (rolleId === '') {
        await speichereTwitchRolle(null);
        res.redirect('/config?gespeichert=1');
        return;
    }

    if (!istGueltigeRolle(rolleId)) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekannte Rolle – bitte eine Rolle aus der Liste wählen.')));
        return;
    }

    await speichereTwitchRolle(rolleId);
    res.redirect('/config?gespeichert=1');
}

// Speichert oder entfernt das nächste Event. Zwei Aktionen über name="aktion" (speichern/entfernen).
// Beim Speichern: Datum/Uhrzeit aus den nativen Feldern zum Timestamp, gegen Vergangenheit prüfen.
export async function handleEventSpeichern(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    if (body.aktion === 'entfernen') {
        await entferneEvent();
        res.redirect('/config?gespeichert=1');
        return;
    }

    const datum = typeof body.datum === 'string' ? body.datum : '';
    const uhrzeit = typeof body.uhrzeit === 'string' ? body.uhrzeit : '';
    const titel = typeof body.titel === 'string' && body.titel.trim() ? body.titel.trim() : undefined;

    const timestamp = parseIsoDateTime(datum, uhrzeit);
    if (timestamp === null) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Ungültiges Datum oder ungültige Uhrzeit.')));
        return;
    }
    if (timestamp <= Date.now()) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Das Datum liegt in der Vergangenheit.')));
        return;
    }

    await speichereEventDaten(timestamp, titel);
    res.redirect('/config?gespeichert=1');
}

// Sport-Admin: drei Aktionen über name="aktion". Kilometer werden als Zahl >= 0 validiert; beim
// Mitglied-Setzen zusätzlich gegen die Mitglieder-Whitelist. 0 bei altkilometer-setzen entfernt sie.
export async function handleSportSpeichern(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    const aktion = typeof body.aktion === 'string' ? body.aktion : '';
    const kilometer = Number(typeof body.kilometer === 'string' ? body.kilometer : NaN);
    if (!Number.isFinite(kilometer) || kilometer < 0) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Ungültige Kilometerangabe.')));
        return;
    }

    if (aktion === 'kilometer-setzen') {
        const mitglied = typeof body.mitglied === 'string' ? body.mitglied : '';
        if (!istGueltigesMitglied(mitglied)) {
            res.status(400).type('html').send(renderPage(forbiddenBody('Unbekanntes Mitglied.')));
            return;
        }
        await speichereKilometer(mitglied, kilometer);
    } else if (aktion === 'altkilometer-addieren') {
        await addiereLegacyKilometer(kilometer);
    } else if (aktion === 'altkilometer-setzen') {
        await setzeLegacyKilometer(kilometer);
    } else if (aktion === 'meilenstein-entfernen') {
        await entferneMeilenstein(kilometer);
    } else {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekannte Aktion.')));
        return;
    }

    res.redirect('/config?gespeichert=1');
}

// Morgengruß: stößt den Historien-Scan an (früher /morgengruss lernen). CSRF zuerst, dann scannen -
// der Scan (greetingHandler.lerneAusHistorie) löst den Kanal selbst auf und liefert null, wenn keiner
// gesetzt/abrufbar ist. Ergebnis per Redirect (PRG), damit ein Reload nicht erneut scannt.
export async function handleMorgengrussLernen(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    const anzahl = await greetingHandler.lerneAusHistorie();
    if (anzahl === null) {
        res.redirect('/config?morgengruss=kein-kanal');
        return;
    }
    res.redirect('/config?gelernt=' + anzahl);
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
// Body-Parser NUR an dieser Route (nicht global!) - global gemountet wuerde er den Rohkoerper des
// Twitch-Webhooks zerstoeren und dessen Signaturpruefung brechen. Auth laeuft davor, damit fuer
// Unbefugte gar nichts geparst wird.
configRouter.post('/config/kanal',
    (req, res, next) => {
        requireConfigAuth(req, res, next).catch((error) => {
            console.error('Fehler in requireConfigAuth:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
            }
        });
    },
    urlencoded({extended: false}),
    (req, res) => {
        handleKanalSpeichern(req, res).catch((error) => {
            console.error('Fehler beim Speichern des Kanals:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Speichern fehlgeschlagen.')));
            }
        });
    }
);
configRouter.post('/config/rolle',
    (req, res, next) => {
        requireConfigAuth(req, res, next).catch((error) => {
            console.error('Fehler in requireConfigAuth:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
            }
        });
    },
    urlencoded({extended: false}),
    (req, res) => {
        handleRolleSpeichern(req, res).catch((error) => {
            console.error('Fehler beim Speichern der Rolle:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Speichern fehlgeschlagen.')));
            }
        });
    }
);
configRouter.post('/config/event',
    (req, res, next) => {
        requireConfigAuth(req, res, next).catch((error) => {
            console.error('Fehler in requireConfigAuth:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
            }
        });
    },
    urlencoded({extended: false}),
    (req, res) => {
        handleEventSpeichern(req, res).catch((error) => {
            console.error('Fehler beim Speichern des Events:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Speichern fehlgeschlagen.')));
            }
        });
    }
);
configRouter.post('/config/sport',
    (req, res, next) => {
        requireConfigAuth(req, res, next).catch((error) => {
            console.error('Fehler in requireConfigAuth:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
            }
        });
    },
    urlencoded({extended: false}),
    (req, res) => {
        handleSportSpeichern(req, res).catch((error) => {
            console.error('Fehler beim Speichern der Sport-Einstellung:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Speichern fehlgeschlagen.')));
            }
        });
    }
);
configRouter.post('/config/morgengruss',
    (req, res, next) => {
        requireConfigAuth(req, res, next).catch((error) => {
            console.error('Fehler in requireConfigAuth:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
            }
        });
    },
    urlencoded({extended: false}),
    (req, res) => {
        handleMorgengrussLernen(req, res).catch((error) => {
            console.error('Fehler beim Morgengruß-Lernen:', error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody('Lernen fehlgeschlagen.')));
            }
        });
    }
);
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
