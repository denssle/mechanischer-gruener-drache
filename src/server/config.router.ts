import {Request, Response, Router, urlencoded} from 'express';
import {randomUUID} from 'crypto';
import {PermissionFlagsBits} from 'discord.js';
import config from '../../config.json' with {type: 'json'};
import client from '../client.js';
import greetingHandler from '../handlers/greeting.handler.js';
import {GRATULATIONS_STUNDE} from '../handlers/geburtstag.handler.js';
import {getLogEntries, LogEntry} from '../services/logBuffer.service.js';
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
    deuteEmojiEingabe,
    entferneEvent,
    entferneMeilenstein,
    EventFelder,
    FeldStatus,
    holeEmojiVorschlaege,
    holeEventFelder,
    holeLegacyKilometer,
    holeMeilensteine,
    holeMitglieder,
    holeMorgengrussEmojis,
    holeRollen,
    holeTextKanaele,
    istGueltigerTextKanal,
    istGueltigeRolle,
    istGueltigesMitglied,
    istKanalFeld,
    istRollenFeld,
    KanalFeld,
    KanalOption,
    ladeKanalFelder,
    ladeRollenFelder,
    MitgliedOption,
    MorgengrussEintrag,
    MorgengrussEmoji,
    RollenFeld,
    RollenOption,
    setzeLegacyKilometer,
    speichereEventDaten,
    speichereKanal,
    speichereKilometer,
    speichereMorgengrussEmoji,
    speichereRolle
} from './config.settings.js';

// Verwaltungs-/Einstellungsseite (README-Todo), abgesichert per Discord-OAuth2-Login.
// Nur Server-Admins kommen rein: Discord liefert (Scope "identify") die User-ID, die
// Admin-Pruefung macht unser EIGENER Bot ueber die gecachte Guild (siehe pruefeAdmin).
//
// Body-Parser: der OAuth-Callback ist ein GET mit Query-Params (?code&state) und braucht keinen;
// die Bearbeiten-Formulare (POST) bekommen ihren express.urlencoded ueber postRoute() NUR auf der
// jeweiligen Route - nie global, sonst wuerde der Twitch-Rohkoerper (express.raw auf /twitch)
// zerstoert und dessen Signaturpruefung brechen.
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

// Die Seiten-Hülle (HTML-Gerüst + das gesamte CSS) für alle Ansichten. Exportiert, damit das
// Vorschau-Skript die Unterseiten mit dem ECHTEN Styling rendern kann - sonst zeigte die Vorschau
// nackte Bodys und wäre als Layout-Werkzeug wertlos.
export function renderPage(bodyHtml: string): string {
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
        form.logout { display: inline; margin: 0; }
        form.logout button { background: none; border: none; padding: 0; font: inherit; font-size: 0.9rem; color: LinkText; text-decoration: underline; cursor: pointer; }
        form.setting { display: flex; align-items: center; gap: 0.75rem; margin: 0.4rem 0; flex-wrap: wrap; }
        form.setting label, form.setting span.pseudo-label { flex: 0 0 16rem; }
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
        p.meldung { margin: 0.2rem 0 0.8rem; font-weight: 600; }
        p.feld-hinweis { margin: 0.4rem 0 0; font-size: 0.85rem; opacity: 0.7; }
        p.meilenstein-titel { margin: 0.9rem 0 0.3rem; }
        ul.meilensteine { list-style: none; padding: 0; margin: 0.3rem 0; }
        li.meilenstein { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.35rem 0; border-bottom: 1px solid rgba(128,128,128,0.2); }
        li.meilenstein form { margin: 0; }
        li.meilenstein button { padding: 0.2rem 0.7rem; }
        table.emojis { border-collapse: collapse; margin: 0.5rem 0 0; font-size: 0.95rem; }
        table.emojis th, table.emojis td { text-align: left; padding: 0.3rem 1rem 0.3rem 0; border-bottom: 1px solid rgba(128,128,128,0.25); }
        table.emojis th { font-weight: 600; }
        td.emoji-zelle { font-size: 1.2rem; line-height: 1; }
        img.emoji { width: 1.4rem; height: 1.4rem; vertical-align: middle; }
        .status-ok { color: #2e7d32; }
        .status-warnung { color: #b26a00; }
        .status-leer { opacity: 0.6; }
        pre.logs { background: rgba(128,128,128,0.12); border-radius: 0.4rem; padding: 0.75rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
        pre.logs .zeit { opacity: 0.6; }
        pre.logs .warn { color: #b26a00; }
        pre.logs .error { color: #c62828; }
        @media (prefers-color-scheme: dark) {
            .status-ok { color: #66bb6a; }
            .status-warnung { color: #ffb74d; }
            pre.logs .warn { color: #ffb74d; }
            pre.logs .error { color: #ef9a9a; }
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

// Platzhalter-Option für ein Feld ohne gültige Vorauswahl. `disabled` = nicht wieder wählbar und
// wird nicht mitgeschickt; zusammen mit `required` am <select> erzwingt das eine echte Wahl.
// Wichtig, weil ein <select> immer irgendetwas selektiert: ohne Platzhalter stünde bei "nicht
// gesetzt" einfach der erste Kanal im Feld und sähe aus, als wäre er konfiguriert. Bei 'warnung'
// (Kanal/Rolle gelöscht oder kein Zugriff) taucht die gespeicherte ID gar nicht in der Liste auf -
// hier steht sie deshalb im Klartext, sonst wäre der kaputte Zustand unsichtbar.
function platzhalterOption(status: FeldStatus, aktuelleId: string | null, leerText: string): string {
    if (status === 'ok') {
        return '';
    }
    const text = status === 'leer'
        ? leerText
        : `— gesetzt (${escapeHtml(aktuelleId ?? '')}), aber nicht abrufbar —`;
    return `<option value="" disabled selected>${text}</option>`;
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
    // id/for-Paar: ohne die Verknüpfung liest ein Screenreader das Feld unbeschriftet vor, und der
    // Klick aufs Label fokussiert nichts. Der Schlüssel ist pro Seite eindeutig.
    const id = `kanal-${feld.schluessel}`;
    return `<form class="setting" method="post" action="/config/kanal">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="feld" value="${escapeHtml(feld.schluessel)}">
        <label for="${escapeHtml(id)}">${escapeHtml(feld.label)}</label>
        <select id="${escapeHtml(id)}" name="kanal" required class="status-${feld.status}">
            ${platzhalterOption(feld.status, feld.aktuelleId, '— nicht gesetzt —')}${optionen}
        </select>
        <button type="submit">Speichern</button>
    </form>`;
}

// Rollen-Einstellung: wie ein Kanal-Feld, aber die Rolle ist optional -> eine "— keine —"-Option
// (leerer Wert) zum Entfernen. Die ist zugleich der Platzhalter für 'leer', deshalb hier kein
// disabled/required: "keine Rolle" ist ein gültiger Zustand, kein fehlender.
export function renderRollenFormular(rollen: RollenOption[], feld: RollenFeld, csrfToken: string): string {
    const id = `rolle-${feld.schluessel}`;
    const keineOption = `<option value=""${feld.status === 'leer' ? ' selected' : ''}>— keine —</option>`;
    const optionen = rollen.map(rolle =>
        `<option value="${escapeHtml(rolle.id)}"${rolle.id === feld.aktuelleId ? ' selected' : ''}>@${escapeHtml(rolle.name)}</option>`
    ).join('\n');
    return `<form class="setting rolle-abstand" method="post" action="/config/rolle">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="feld" value="${escapeHtml(feld.schluessel)}">
        <label for="${escapeHtml(id)}">${escapeHtml(feld.label)}</label>
        <select id="${escapeHtml(id)}" name="rolle" class="status-${feld.status}">
            ${feld.status === 'warnung' ? platzhalterOption(feld.status, feld.aktuelleId, '') : ''}${keineOption}${optionen}
        </select>
        <button type="submit">Speichern</button>
    </form>`;
}

// Die Champion-Rolle wird vom Bot automatisch weitergereicht - ohne diesen Hinweis sähe sie aus
// wie eine Rolle, die man hier von Hand pflegt.
export function renderPingPongHinweis(): string {
    return `<p class="feld-hinweis">Die Punkte laufen monatsweise: am Monatswechsel bekommt Platz eins
        diese Rolle (der bisherige Champion gibt sie ab) und einen Eintrag in der Ruhmeshalle
        (<code>/pingpong ruhmeshalle</code>), danach starten alle wieder bei 0. Dafür brauche ich
        das Recht „Rollen verwalten“ und muss in der Rollen-Hierarchie über der Champion-Rolle
        stehen – <code>/diagnose</code> prüft beides.</p>`;
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
    </form>
    <p class="feld-hinweis">Datum und Uhrzeit gelten in der Zeitzone des Servers (Europe/Berlin).
    Ohne Uhrzeit wird Mitternacht angenommen.</p>`;
}

// Kilometerstand fürs Dropdown-Label: auf zwei Nachkommastellen, damit aufsummierte Float-Reste
// ("12.340000000000002") nicht als Wert erscheinen. Bewusst NICHT rundeKilometer (ganze km) - ein
// Admin korrigiert hier einen konkreten Stand und muss den echten Wert sehen.
function formatKilometerstand(km: number): string {
    return String(Math.round(km * 100) / 100);
}

// Sport-Admin-Formulare: Kilometerstand eines Mitglieds setzen (Mitglied-Dropdown = Whitelist) und
// Bestandskilometer (Addieren / Setzen; 0 = entfernen). Alle posten an /config/sport mit name="aktion".
// Das Setzen ist die gefährlichste Aktion der Seite (überschreibt fremde Kilometer dauerhaft, legt
// keinen SportEntry an, also auch per /sport bearbeiten nicht zu reparieren). Deshalb drei Bremsen:
// der aktuelle Stand steht im Label, vorausgewählt ist NICHTS (leere Pflicht-Option statt des ersten
// Mitglieds - ein Fehlklick trifft sonst irgendwen), und der Button fragt nach.
export function renderSportAdmin(mitglieder: MitgliedOption[], legacyKilometer: number, csrfToken: string): string {
    const mitgliedFeld = mitglieder.length
        ? `<select id="sport-mitglied" name="mitglied" required>
            <option value="" selected>— Mitglied wählen —</option>
            ${mitglieder.map(m =>
            `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${formatKilometerstand(m.kilometer)} km)</option>`).join('\n')}
        </select>`
        : '<span class="status-leer">keine Mitglieder gefunden</span>';
    // Das Label zeigt aufs Mitglied-Dropdown (die eigentliche Wahl); das Kilometer-Feld daneben
    // traegt sein eigenes aria-label, weil eine zweite sichtbare Beschriftung die Zeile sprengen wuerde.
    return `<form class="setting" method="post" action="/config/sport">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="aktion" value="kilometer-setzen">
        <label for="sport-mitglied">Kilometerstand eines Mitglieds setzen</label>
        ${mitgliedFeld}
        <input type="number" name="kilometer" min="0" step="0.01" placeholder="km" required aria-label="Kilometer">
        <button type="submit" onclick="return confirm('Kilometerstand des gewählten Mitglieds wirklich überschreiben? Der bisherige Wert ist danach weg.')">Setzen</button>
    </form>
    <form class="setting" method="post" action="/config/sport">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <label for="sport-altkilometer">Bestandskilometer (aktuell ${formatKilometerstand(legacyKilometer)} km)</label>
        <input id="sport-altkilometer" type="number" name="kilometer" min="0" step="0.01" placeholder="km" required>
        <button type="submit" name="aktion" value="altkilometer-addieren">Addieren</button>
        <button type="submit" name="aktion" value="altkilometer-setzen" onclick="return confirm('Bestandskilometer wirklich auf den eingegebenen Wert setzen? 0 entfernt sie ganz.')">Setzen (0 = entfernen)</button>
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
            <span><strong>${Number(m.kilometers)} km</strong> – ${escapeHtml(gekuerzt)}${m.announced ? ' <em>(angekündigt)</em>' : ''}</span>
            <form method="post" action="/config/sport">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="aktion" value="meilenstein-entfernen">
                <input type="hidden" name="kilometer" value="${Number(m.kilometers)}">
                <button type="submit" onclick="return confirm('Meilenstein bei ${Number(m.kilometers)} km wirklich entfernen? Der Ankündigungstext ist danach weg.')">Entfernen</button>
            </form>
        </li>`;
        }).join('\n');
    return `<p class="meilenstein-titel"><strong>Meilensteine</strong> (Anlegen per <code>/sport meilenstein setzen</code>):</p>
    <ul class="meilensteine">${zeilen}</ul>`;
}

// Übersicht Person → persönliches Morgengruß-Emoji. Reine Anzeige (kein Formular): die Zuordnung
// entsteht durch den Historien-Scan, hier soll man nur sehen, was dabei herauskam - vorher war sie
// nirgends einsehbar und zeigte sich erst, wenn jemand am nächsten Morgen schrieb.
// Custom-Emojis brauchen ein <img> (Discord-Markup rendert nicht im Browser), die Spalte „Herkunft"
// trennt Gelerntes vom abgeleiteten Fallback - sonst sähe der Fallback wie eine echte Zuordnung aus.
export function renderMorgengrussEmojis(
    eintraege: MorgengrussEintrag[],
    vorschlaege: string[],
    csrfToken: string
): string {
    if (!eintraege.length) {
        return '<p class="status-leer">Keine Mitglieder gefunden.</p>';
    }
    // Ein Formular je Zeile, alle gegen dieselbe Route. FREITEXT statt Dropdown (seit 2026-07-26):
    // eine geschlossene Auswahl kannte gängige Emojis wie 🍪 schlicht nicht. Das <datalist> bietet
    // Pool und Server-Emojis weiterhin zum Anklicken an, schränkt die Eingabe aber NICHT ein -
    // geprüft wird serverseitig in deuteEmojiEingabe.
    const aendern = (eintrag: MorgengrussEintrag): string =>
        `<form method="post" action="/config/morgengruss-emoji">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="mitglied" value="${escapeHtml(eintrag.id)}">
            <input type="text" name="emoji" list="emoji-vorschlaege" required
                   value="${escapeHtml(eintrag.eingabeWert)}"
                   size="10" maxlength="16" autocomplete="off"
                   aria-label="Emoji für ${escapeHtml(eintrag.name)}">
            <button type="submit">Speichern</button>
        </form>`;

    // Einmal für alle Zeilen - ein <datalist> je Zeile wäre dieselbe Liste dutzendfach im HTML.
    const datalist = `<datalist id="emoji-vorschlaege">${
        vorschlaege.map(v => `<option value="${escapeHtml(v)}"></option>`).join('')
    }</datalist>`;
    const zelle = (emoji: MorgengrussEmoji): string => {
        switch (emoji.art) {
            case 'unicode':
                return escapeHtml(emoji.zeichen);
            case 'custom':
                return `<img class="emoji" src="${escapeHtml(emoji.url)}" alt="${escapeHtml(emoji.name)}" title="${escapeHtml(emoji.name)}">`;
            case 'unbekannt':
                // Gelernt, aber das Server-Emoji gibt es nicht mehr - beim Gruß würde message.react
                // damit scheitern, das gehört sichtbar gemacht statt als leere Zelle verschluckt.
                return `<span class="status-warnung" title="Emoji ${escapeHtml(emoji.id)} gibt es auf dem Server nicht mehr">gelöscht</span>`;
        }
    };
    // Herkunft in drei Stufen (= die Rangfolge beim Gruß): „manuell" ist von Hand gesetzt und wird vom
    // Lern-Button NICHT überschrieben, „gelernt" kann der nächste Scan ändern, „abgeleitet" ist der
    // blasse Fallback. Ohne die Unterscheidung wüsste man nicht, welche Zeilen ein Scan noch anfasst.
    const herkunft = (e: MorgengrussEintrag): string => {
        switch (e.herkunft) {
            case 'manuell':
                return '<td title="Von Hand gesetzt - der Lern-Button überschreibt das nicht">manuell</td>';
            case 'gelernt':
                return '<td>gelernt</td>';
            case 'abgeleitet':
                return '<td class="status-leer">abgeleitet</td>';
        }
    };
    const zeilen = eintraege.map(e =>
        `<tr><td>${escapeHtml(e.name)}</td>` +
        `<td class="emoji-zelle">${zelle(e.emoji)}</td>` +
        herkunft(e) +
        `<td>${aendern(e)}</td></tr>`
    ).join('\n');
    return `${datalist}<table class="emojis">
        <thead><tr><th>Name</th><th>Emoji</th><th>Herkunft</th><th>Ändern</th></tr></thead>
        <tbody>${zeilen}</tbody>
    </table>
    <p class="feld-hinweis">Ein beliebiges Emoji eintippen oder einfügen. Server-Emojis als
    <code>:name:</code> – die Vorschlagsliste am Feld zeigt Pool und Server-Emojis an.</p>`;
}

// Die Emoji-Übersicht liegt seit 2026-07-26 auf einer EIGENEN Seite (/config/morgengruss-emojis),
// nicht mehr im Morgengruß-Bereich: die Tabelle wächst mit der Mitgliederzahl und hat /config sonst
// dominiert. Muster wie /config/logs. Hier steht nur noch der Link dorthin.
export function renderMorgengrussEmojiLink(anzahl: number): string {
    return `<p class="feld-hinweis"><a href="/config/morgengruss-emojis">Persönliche Emojis ansehen und ändern</a>
    (${anzahl} ${anzahl === 1 ? 'Person' : 'Personen'})</p>`;
}

// Die ausgelagerte Seite: Überschrift, Tabelle, Rückweg. Reine Präsentation wie renderConfigSeite,
// damit sie sich genauso ohne Deploy in der Vorschau bauen lässt.
export function renderMorgengrussEmojiSeite(
    eintraege: MorgengrussEintrag[],
    vorschlaege: string[],
    csrfToken: string,
    gespeichert = false
): string {
    return `<h1>Persönliche Morgengruß-Emojis</h1>
    <p>Womit der Bot die erste Nachricht des Tages quittiert. „Manuell" ist hier von Hand gesetzt und
    bleibt beim Lernen unangetastet, „gelernt" stammt aus der Chat-Historie, „abgeleitet" ist der feste
    Fallback aus der User-ID.</p>
    ${gespeichert ? '<p class="meldung status-ok">Persönliches Emoji gespeichert.</p>' : ''}
    ${renderMorgengrussEmojis(eintraege, vorschlaege, csrfToken)}
    <p><a href="/config">Zurück zu den Einstellungen</a></p>`;
}

// Morgengruß: Button, der den Historien-Scan für die persönlichen Emojis anstößt (früher
// /morgengruss lernen). Der Kanal wird oben im selben Bereich gesetzt; ist keiner da, meldet das der
// Handler nach dem Klick. Der Scan kostet ein paar API-Calls, die POST-Antwort blockt so lange.
export function renderMorgengrussLernen(csrfToken: string): string {
    // <span>, kein <label>: hier gibt es kein Eingabefeld, das beschriftet werden könnte (ein <label>
    // für einen Button ist ungültiges HTML) - der Button-Text ist seine eigene Beschriftung.
    return `<form class="setting" method="post" action="/config/morgengruss">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <span class="pseudo-label">Persönliche Emojis aus der Chat-Historie lernen</span>
        <button type="submit">Jetzt lernen</button>
    </form>`;
}

// Geburtstage: hier gibt es bewusst NUR den Kanal zu setzen. Die Daten selbst tragen die Leute
// ausschließlich selbst per /geburtstag setzen ein - ein Admin-Formular, das fremde Geburtsdaten
// hinterlegt, wäre genau die Datenhaltung, die docs/datenhaltung.md vermeiden will.
export function renderGeburtstagHinweis(): string {
    return `<p class="feld-hinweis">Eingetragen wird ausschließlich selbst per
    <code>/geburtstag setzen</code> (Jahr freiwillig). Gratuliert wird morgens um
    ${GRATULATIONS_STUNDE} Uhr in diesem Kanal.</p>`;
}

// Der Spielwelt-Bereich hat (noch) kein eigenes Formular ausser dem Kanal - der Hinweis erklaert,
// wofuer der Kanal ueberhaupt gut ist. Ohne ihn stuende dort ein Dropdown ohne erkennbaren Zweck.
export function renderSpielweltHinweis(): string {
    return `<p class="feld-hinweis">Hier gratuliert der Bot, wenn eine Person mit verknüpftem
    Charakter den Drachen erlegt hat (erkannt am Stufen-Rücksturz auf 1, wenn
    <code>/online</code> oder <code>/charakter anzeigen</code> ohnehin Daten abrufen).
    Ohne Kanal passiert nichts.</p>`;
}

function configBody(bereicheHtml: string): string {
    return `<h1>Mechanischer Grüner Drache</h1>
    <p>Bot-Einstellungen, nach Bereich gruppiert.</p>
    ${bereicheHtml}
    <p><a href="/config/logs">Bot-Logs ansehen</a></p>
    <form class="logout" method="post" action="/config/logout"><button type="submit">Abmelden</button></form>`;
}

// Lokaler Zeitstempel (Host = Europe/Berlin) als HH:MM:SS - fuer die Log-Ansicht reicht die Uhrzeit,
// das Datum steht im Zweifel im Text. Bewusst manuell formatiert (kein Locale-Rateraten).
function formatLogZeit(ms: number): string {
    const d = new Date(ms);
    const zwei = (n: number) => String(n).padStart(2, '0');
    return `${zwei(d.getHours())}:${zwei(d.getMinutes())}:${zwei(d.getSeconds())}`;
}

// Reine Darstellung der Log-Zeilen in einem <pre>. Jede Zeile wird escaped - Log-Text kann
// User-/Discord-Inhalte tragen (Namen, Kanalnamen in Fehlermeldungen) -> sonst XSS auf der Seite.
//
// NEUESTE ZUERST (seit 2026-07-26): der Puffer ist chronologisch, angezeigt wird er umgekehrt. Wer
// hier nachsieht, sucht "was ist gerade passiert" und musste vorher 500 Zeilen weit runterscrollen.
// `nurProbleme` blendet die reinen log-Zeilen aus - bei einem Bot, der viel Normalbetrieb loggt, ist
// das der Unterschied zwischen brauchbar und nicht.
export function renderLogs(entries: LogEntry[], nurProbleme = false): string {
    const probleme = entries.filter(e => e.level !== 'log').length;
    const gezeigt = nurProbleme ? entries.filter(e => e.level !== 'log') : entries;
    const zeilen = [...gezeigt].reverse().map(e => {
        const klasse = e.level === 'log' ? '' : ` class="${e.level}"`;
        return `<span class="zeit">${formatLogZeit(e.zeit)}</span> <span${klasse}>${escapeHtml(e.text)}</span>`;
    }).join('\n');

    // Der jeweils aktive Filter ist kein Link mehr (sonst klickt man sich im Kreis).
    const filter = [
        nurProbleme
            ? `<a href="/config/logs">Alle (${entries.length})</a>`
            : `<strong>Alle (${entries.length})</strong>`,
        nurProbleme
            ? `<strong>Nur Warnungen und Fehler (${probleme})</strong>`
            : `<a href="/config/logs?nur=probleme">Nur Warnungen und Fehler (${probleme})</a>`,
    ].join(' · ');

    const inhalt = gezeigt.length
        ? `<pre class="logs">${zeilen}</pre>`
        : `<p class="status-leer">${nurProbleme
            ? 'Keine Warnungen oder Fehler im Puffer.'
            : 'Noch keine Log-Zeilen im Puffer (der Bot wurde gerade erst gestartet?).'}</p>`;

    return `<h1>Bot-Logs</h1>
    <p>${gezeigt.length} Zeilen aus dem laufenden Prozess, <strong>neueste zuerst</strong>
    (nach Neustart leer, keine Nachrichteninhalte).</p>
    <p>${filter}</p>
    ${inhalt}
    <p><a href="${nurProbleme ? '/config/logs?nur=probleme' : '/config/logs'}">Aktualisieren</a> · <a href="/config">Zurück</a></p>`;
}

// Rückmeldung nach einer Aktion. `bereich` ist die Bereichs-ID, in der sie erscheint - dadurch
// steht sie dort, wo geklickt wurde, statt als anonymes "Gespeichert." ganz oben.
export interface Meldung {
    bereich: string;
    text: string;
    art: 'ok' | 'warnung';
}

export interface ConfigSeiteDaten {
    kanalFelder: KanalFeld[];
    kanaele: KanalOption[];
    rollen: RollenOption[];
    rollenFelder: RollenFeld[];
    eventFelder: EventFelder;
    mitglieder: MitgliedOption[];
    legacyKilometer: number;
    meilensteine: SportMilestone[];
    // Nur die Anzahl für den Link - die Tabelle selbst liegt auf /config/morgengruss-emojis.
    // Dadurch braucht die Hauptseite die Emoji-Daten gar nicht mehr zu laden.
    anzahlEmojiEintraege: number;
    csrfToken: string;
    meldung?: Meldung;
}

// Ein fachlich abgegrenzter Bereich als <fieldset> (semantisch die Formular-Gruppierung),
// die <legend> ist die Bereichs-Überschrift. Die id ist das Sprungziel des Redirects nach dem
// Speichern (#bereich-sport), damit man nicht am Seitenanfang landet.
function renderBereich(id: string, titel: string, inhaltHtml: string, meldung?: Meldung): string {
    const hinweis = meldung
        ? `<p class="meldung status-${meldung.art}">${escapeHtml(meldung.text)}</p>`
        : '';
    return `<fieldset class="bereich" id="bereich-${escapeHtml(id)}">
        <legend>${escapeHtml(titel)}</legend>
        ${hinweis}
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
    const rolle = (schluessel: string): string => {
        const feld = daten.rollenFelder.find(f => f.schluessel === schluessel);
        return feld ? renderRollenFormular(daten.rollen, feld, csrf) : '';
    };
    const meldungFuer = (bereich: string): Meldung | undefined =>
        daten.meldung?.bereich === bereich ? daten.meldung : undefined;
    // Nach Feature gruppiert, damit fachlich Zusammengehöriges zusammensteht.
    const bereiche =
        renderBereich('twitch', 'Twitch',
            kanal('twitch-kanal') + rolle('twitch-rolle'),
            meldungFuer('twitch')) +
        renderBereich('sport', 'Sport',
            kanal('sport-kanal') + renderSportAdmin(daten.mitglieder, daten.legacyKilometer, csrf) + renderMeilensteinListe(daten.meilensteine, csrf),
            meldungFuer('sport')) +
        renderBereich('protokoll', 'Nachrichten-Protokoll',
            kanal('protokoll'),
            meldungFuer('protokoll')) +
        renderBereich('morgengruss', 'Morgengruß',
            kanal('morgengruss-kanal') + renderMorgengrussLernen(csrf) + renderMorgengrussEmojiLink(daten.anzahlEmojiEintraege),
            meldungFuer('morgengruss')) +
        renderBereich('geburtstag', 'Geburtstage',
            kanal('geburtstag-kanal') + renderGeburtstagHinweis(),
            meldungFuer('geburtstag')) +
        renderBereich('spielwelt', 'Spielwelt',
            kanal('spielwelt-kanal') + renderSpielweltHinweis(),
            meldungFuer('spielwelt')) +
        renderBereich('pingpong', 'Ping-Pong',
            rolle('pingpong-champion') + renderPingPongHinweis(),
            meldungFuer('pingpong')) +
        renderBereich('event', 'Event',
            renderEventFormular(daten.eventFelder, csrf),
            meldungFuer('event'));
    return renderPage(configBody(bereiche));
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
        // force: true erzwingt den API-Abruf - ohne das bedient sich fetch aus dem Member-Cache,
        // und die "frische Pruefung bei jedem Aufruf" waere real nur eine Cache-Pruefung.
        const member = await guild.members.fetch({user: userId, force: true});
        return member.permissions.has(PermissionFlagsBits.Administrator);
    } catch (error) {
        // members.fetch wirft auch, wenn die Person gar nicht (mehr) auf dem Server ist.
        console.warn('Config-Login: Admin-Pruefung fehlgeschlagen:', error);
        return false;
    }
}

// Nicht (mehr) angemeldet. Bei GET die Login-Seite mit 200 - das ist die normale Einstiegsseite.
// Bei POST dagegen 401 samt Hinweis: dort hat gerade ein Formular abgeschickt und die Eingaben sind
// weg. Ein 200 mit Login-HTML wäre semantisch falsch und sähe aus, als hätte das Speichern geklappt.
function antworteNichtAngemeldet(req: Request, res: Response): void {
    if (req.method === 'POST') {
        res.status(401).type('html').send(renderPage(`<h1>Sitzung abgelaufen</h1>
    <p>Deine Anmeldung gilt nicht mehr, die Eingabe wurde <strong>nicht</strong> gespeichert.</p>
    <p><a class="button" href="/config/login">Neu anmelden</a></p>`));
        return;
    }
    res.type('html').send(renderPage(LOGIN_BODY));
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
        antworteNichtAngemeldet(req, res);
        return;
    }
    // Frische Admin-Pruefung bei JEDEM Aufruf, nicht nur beim Login: verliert jemand die
    // Admin-Rolle oder verlaesst den Server, ist er sofort ausgesperrt statt erst nach Cookie-Ablauf.
    // Das tote Cookie wird dabei gleich geloescht (sonst loest es bei jedem Request erneut ein fetch aus).
    if (!(await pruefeAdmin(userId))) {
        res.setHeader('Set-Cookie', buildSetCookie(SESSION_COOKIE, '', 0, COOKIE_SECURE));
        antworteNichtAngemeldet(req, res);
        return;
    }
    // Fuer nachgelagerte Handler: wer ist eingeloggt (Basis des CSRF-Tokens).
    res.locals.configUserId = userId;
    next();
}

// Was nach welcher Aktion gemeldet wird - und in welchem Bereich. Bewusst eine feste Tabelle statt
// eines aus der Query gebauten Textes: der Wert aus ?gespeichert= wird nur als Schlüssel benutzt,
// nie ausgegeben. Die Kanal-Schlüssel sind dieselben wie in KANAL_SERVICES (config.settings.ts).
const MELDUNGEN: Record<string, {bereich: string; text: string}> = {
    'protokoll': {bereich: 'protokoll', text: 'Protokoll-Kanal gespeichert.'},
    'twitch-kanal': {bereich: 'twitch', text: 'Twitch-Benachrichtigungskanal gespeichert.'},
    'sport-kanal': {bereich: 'sport', text: 'Sport-Ankündigungskanal gespeichert.'},
    'morgengruss-kanal': {bereich: 'morgengruss', text: 'Morgengruß-Kanal gespeichert.'},
    'geburtstag-kanal': {bereich: 'geburtstag', text: 'Geburtstagskanal gespeichert.'},
    'spielwelt-kanal': {bereich: 'spielwelt', text: 'Spielwelt-Ankündigungskanal gespeichert.'},
    'twitch-rolle': {bereich: 'twitch', text: 'Twitch-Benachrichtigungsrolle gespeichert.'},
    'twitch-rolle-entfernt': {bereich: 'twitch', text: 'Twitch-Benachrichtigungsrolle entfernt.'},
    'pingpong-champion': {bereich: 'pingpong', text: 'Champion-Rolle gespeichert.'},
    'pingpong-champion-entfernt': {bereich: 'pingpong', text: 'Champion-Rolle entfernt.'},
    'event': {bereich: 'event', text: 'Event gespeichert.'},
    'event-entfernt': {bereich: 'event', text: 'Event entfernt.'},
    'kilometer-setzen': {bereich: 'sport', text: 'Kilometerstand gesetzt.'},
    'altkilometer-addieren': {bereich: 'sport', text: 'Bestandskilometer addiert.'},
    'altkilometer-setzen': {bereich: 'sport', text: 'Bestandskilometer gesetzt.'},
    'meilenstein-entfernen': {bereich: 'sport', text: 'Meilenstein entfernt.'},
};

// Post/Redirect/Get (kein Doppel-Speichern beim Reload) + Anker auf den Bereich, damit man dort
// landet, wo man geklickt hat. Der Schlüssel sagt zugleich, WAS gespeichert wurde.
function zurueckZumBereich(res: Response, schluessel: string): void {
    const ziel = MELDUNGEN[schluessel];
    res.redirect(`/config?gespeichert=${encodeURIComponent(schluessel)}#bereich-${ziel.bereich}`);
}

// Liest die Rückmeldung aus der Query. hasOwnProperty statt direktem Zugriff, damit ?gespeichert=
// constructor o.ä. nicht in der Prototypenkette landet (wie istKanalFeld). Die gelernte Anzahl wird
// zu Number gecastet, nicht roh interpoliert - sonst wäre ?gelernt= ein XSS-Vektor.
export function leseMeldung(req: Request): Meldung | undefined {
    const gespeichert = req.query.gespeichert;
    if (typeof gespeichert === 'string' && Object.prototype.hasOwnProperty.call(MELDUNGEN, gespeichert)) {
        return {...MELDUNGEN[gespeichert], art: 'ok'};
    }
    const gelernt = Number(req.query.gelernt);
    if (typeof req.query.gelernt === 'string' && Number.isFinite(gelernt)) {
        return {
            bereich: 'morgengruss',
            text: `Aus der Historie habe ich ${gelernt} persönliche Emojis gelernt.`,
            art: 'ok',
        };
    }
    if (req.query.morgengruss === 'kein-kanal') {
        return {
            bereich: 'morgengruss',
            text: 'Es ist kein (abrufbarer) Morgengruß-Kanal gesetzt. Setze ihn zuerst hier im Bereich Morgengruß.',
            art: 'warnung',
        };
    }
    return undefined;
}

export async function handleConfigPage(req: Request, res: Response): Promise<void> {
    try {
        const userId = res.locals.configUserId as string;
        // Parallel: die Abfragen hängen nicht voneinander ab, und jede ist mindestens ein
        // Redis-Roundtrip (ladeKanalFelder zusätzlich vier channels.fetch).
        const [kanalFelder, rollenFelder, eventFelder, mitglieder, legacyKilometer, meilensteine] = await Promise.all([
            ladeKanalFelder(),
            ladeRollenFelder(),
            holeEventFelder(),
            holeMitglieder(),
            holeLegacyKilometer(),
            holeMeilensteine(),
        ]);
        const html = renderConfigSeite({
            kanalFelder,
            kanaele: holeTextKanaele(),
            rollen: holeRollen(),
            rollenFelder,
            eventFelder,
            mitglieder,
            legacyKilometer,
            meilensteine,
            anzahlEmojiEintraege: mitglieder.length,
            csrfToken: createCsrfToken(userId),
            meldung: leseMeldung(req),
        });
        res.type('html').send(html);
    } catch (error) {
        // Ein Redis-/Discord-Problem darf die Seite nicht komplett kosten - lieber ein Hinweis.
        console.error('Fehler beim Laden der Config-Einstellungen:', error);
        res.type('html').send(renderPage(configBody('<p>Die Einstellungen konnten gerade nicht geladen werden.</p>')));
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
    zurueckZumBereich(res, feld);
}

// Speichert eine Rollen-Einstellung (per "feld" benannt, wie bei den Kanaelen). Leerer Wert =
// Rolle entfernen (beide Rollen sind optional). Reihenfolge wie ueberall: CSRF → Feld-Whitelist →
// Rollen-Whitelist → speichern → Redirect.
export async function handleRolleSpeichern(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    const feld = typeof body.feld === 'string' ? body.feld : '';
    if (!istRollenFeld(feld)) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekannte Einstellung.')));
        return;
    }

    const rolleId = typeof body.rolle === 'string' ? body.rolle : '';
    if (rolleId === '') {
        await speichereRolle(feld, null);
        zurueckZumBereich(res, `${feld}-entfernt`);
        return;
    }

    if (!istGueltigeRolle(rolleId)) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekannte Rolle – bitte eine Rolle aus der Liste wählen.')));
        return;
    }

    await speichereRolle(feld, rolleId);
    zurueckZumBereich(res, feld);
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
        zurueckZumBereich(res, 'event-entfernt');
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
    zurueckZumBereich(res, 'event');
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

    zurueckZumBereich(res, aktion);
}

// Eigene Seite für die Emoji-Übersicht (ausgelagert, damit /config nicht von einer mit der
// Mitgliederzahl wachsenden Tabelle dominiert wird - Muster wie /config/logs).
export async function handleMorgengrussEmojiSeite(req: Request, res: Response): Promise<void> {
    try {
        const userId = res.locals.configUserId as string;
        const [eintraege, vorschlaege] = await Promise.all([
            holeMorgengrussEmojis(),
            holeEmojiVorschlaege(),
        ]);
        res.type('html').send(renderPage(renderMorgengrussEmojiSeite(
            eintraege, vorschlaege, createCsrfToken(userId), req.query.gespeichert === '1'
        )));
    } catch (error) {
        console.error('Fehler beim Laden der Morgengruß-Emojis:', error);
        res.type('html').send(renderPage(
            '<h1>Persönliche Morgengruß-Emojis</h1><p>Die Liste konnte gerade nicht geladen werden.</p>' +
            '<p><a href="/config">Zurück zu den Einstellungen</a></p>'
        ));
    }
}

// Setzt das persönliche Morgengruß-Emoji einer Person von Hand (korrigiert also, was der Lern-Scan
// abgeleitet hat). Reihenfolge wie überall: CSRF → Mitglied gegen die Whitelist →
// deuteEmojiEingabe (synchron und rein, prüft den Freitext) → speichern → Redirect.
export async function handleMorgengrussEmojiSpeichern(req: Request, res: Response): Promise<void> {
    const userId = res.locals.configUserId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body._csrf === 'string' ? body._csrf : undefined;

    if (!verifyCsrfToken(userId, token)) {
        res.status(403).type('html').send(renderPage(forbiddenBody('Ungültiges oder fehlendes CSRF-Token.')));
        return;
    }

    const mitglied = typeof body.mitglied === 'string' ? body.mitglied : '';
    if (!istGueltigesMitglied(mitglied)) {
        res.status(400).type('html').send(renderPage(forbiddenBody('Unbekanntes Mitglied.')));
        return;
    }

    // Freitext: deuteEmojiEingabe entscheidet, was gespeichert wird (Zeichen oder Server-Emoji-ID)
    // und lehnt alles ab, was kein brauchbares Emoji ist - ein erfundenes `:name:` oder normaler
    // Text würde beim Gruß sonst still an message.react scheitern.
    const wert = deuteEmojiEingabe(typeof body.emoji === 'string' ? body.emoji : '');
    if (wert === null) {
        res.status(400).type('html').send(renderPage(forbiddenBody(
            'Das ist kein Emoji, das ich setzen kann. Erlaubt sind ein einzelnes Emoji ' +
            '(z. B. 🍪) oder ein Server-Emoji als <code>:name:</code>.'
        )));
        return;
    }

    await speichereMorgengrussEmoji(mitglied, wert);
    // Zurück auf die ausgelagerte Seite (nicht auf /config), damit man dort bleibt, wo man
    // gearbeitet hat - Post/Redirect/Get wie überall.
    res.redirect('/config/morgengruss-emojis?gespeichert=1');
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

    // Eigene Query-Parameter statt eines MELDUNGEN-Schlüssels: die Rückmeldung trägt eine Zahl
    // bzw. ist eine Warnung. Anker wie bei zurueckZumBereich, damit man im Bereich landet.
    const anzahl = await greetingHandler.lerneAusHistorie();
    if (anzahl === null) {
        res.redirect('/config?morgengruss=kein-kanal#bereich-morgengruss');
        return;
    }
    res.redirect(`/config?gelernt=${anzahl}#bereich-morgengruss`);
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

// Zeigt die gepufferten Log-Zeilen des laufenden Prozesses. Reines Lesen aus dem RAM-Ringpuffer.
export function handleLogs(req: Request, res: Response): void {
    res.type('html').send(renderPage(renderLogs(getLogEntries(), req.query.nur === 'probleme')));
}

const configRouter = Router();

// Admin-Bereich: nichts davon gehoert in einen Browser-/Proxy-Cache (der Back-Button wuerde sonst
// nach dem Abmelden noch die Einstellungen zeigen) und nichts in einen Suchindex - die Login-Seite
// ist oeffentlich erreichbar. Benannt exportiert wie die uebrigen Handler, damit der Test ihn direkt
// mit Mock-req/res aufrufen kann (kein supertest im Projekt).
export function setzeAdminHeader(_req: Request, res: Response, next: () => void): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Kein Einbetten in fremde Seiten (Clickjacking). Durch SameSite=Lax am Session-Cookie ist das
    // praktisch schon entschaerft (im iframe wird das Cookie nicht mitgeschickt), der Header ist
    // billige Tiefenverteidigung.
    res.setHeader('X-Frame-Options', 'DENY');
    next();
}

// Gilt fuer /config und alles darunter.
configRouter.use('/config', setzeAdminHeader);

// Alle Handler der Seite sind async. Ohne .catch killt eine unhandled rejection den kompletten
// Bot-Prozess (siehe CLAUDE.md) - deshalb dieser Wrapper statt sechs handgeschriebener Kopien.
type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function fangeFehler(handler: AsyncHandler, kontext: string, meldung: string) {
    return (req: Request, res: Response): void => {
        handler(req, res).catch((error) => {
            console.error(`${kontext}:`, error);
            if (!res.headersSent) {
                res.status(500).type('html').send(renderPage(forbiddenBody(meldung)));
            }
        });
    };
}

// requireConfigAuth ist async (frische Admin-Pruefung bei JEDEM Aufruf) - das .catch ist das
// Sicherheitsnetz, obwohl pruefeAdmin selbst schon alle Fehler abfaengt.
function geschuetzt(req: Request, res: Response, next: () => void): void {
    requireConfigAuth(req, res, next).catch((error) => {
        console.error('Fehler in requireConfigAuth:', error);
        if (!res.headersSent) {
            res.status(500).type('html').send(renderPage(forbiddenBody('Interner Fehler bei der Anmeldung.')));
        }
    });
}

// Jede POST-Route hat denselben Aufbau, deshalb hier gebuendelt:
// 1. Auth VOR dem Body-Parser, damit fuer Unbefugte gar nichts geparst wird.
// 2. Der urlencoded-Parser NUR HIER, nie global (!) - global gemountet wuerde er den Rohkoerper des
//    Twitch-Webhooks zerstoeren und dessen Signaturpruefung brechen. Absicherung dagegen ist der
//    Integrationstest `npm run test:twitch`, der weiter 204 liefern muss.
// 3. Der Handler mit .catch.
function postRoute(pfad: string, handler: AsyncHandler, kontext: string, meldung = 'Speichern fehlgeschlagen.'): void {
    configRouter.post(pfad, geschuetzt, urlencoded({extended: false}), fangeFehler(handler, kontext, meldung));
}

configRouter.get('/config', geschuetzt,
    fangeFehler(handleConfigPage, 'Fehler beim Rendern der Config-Seite', 'Interner Fehler.'));

postRoute('/config/kanal', handleKanalSpeichern, 'Fehler beim Speichern des Kanals');
postRoute('/config/rolle', handleRolleSpeichern, 'Fehler beim Speichern der Rolle');
postRoute('/config/event', handleEventSpeichern, 'Fehler beim Speichern des Events');
postRoute('/config/sport', handleSportSpeichern, 'Fehler beim Speichern der Sport-Einstellung');
postRoute('/config/morgengruss', handleMorgengrussLernen, 'Fehler beim Morgengruß-Lernen', 'Lernen fehlgeschlagen.');
postRoute('/config/morgengruss-emoji', handleMorgengrussEmojiSpeichern, 'Fehler beim Speichern des Morgengruß-Emojis');

configRouter.get('/config/login', handleLogin);
configRouter.get('/config/callback',
    fangeFehler(handleCallback, 'Fehler im Config-OAuth-Callback', 'Interner Fehler bei der Anmeldung.'));
// Reines Lesen (GET) - kein Body-Parser, kein CSRF noetig.
configRouter.get('/config/logs', geschuetzt, handleLogs);
configRouter.get('/config/morgengruss-emojis', geschuetzt,
    fangeFehler(handleMorgengrussEmojiSeite, 'Fehler beim Rendern der Morgengruß-Emoji-Seite', 'Interner Fehler.'));
// POST statt GET (seit 2026-07-28): ein GET-Logout war per <img src=".../config/logout"> von
// fremden Seiten ausloesbar (nur ein Aergernis, aber alle anderen Aktionen sind sauber POST).
// Bewusst ohne Auth/CSRF: Abmelden loescht nur das eigene Cookie, ist idempotent und muss auch
// mit abgelaufener Session noch funktionieren. Kein Body -> kein urlencoded-Parser noetig.
configRouter.post('/config/logout', handleLogout);

export default configRouter;
