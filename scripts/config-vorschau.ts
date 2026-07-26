import {writeFileSync} from 'fs';
import path from 'path';
// Import aus dem gebauten dist/ (declaration: true -> voll typisiert). Dev-Werkzeug: rendert die
// /config-Seite mit Beispieldaten in eine HTML-Datei, damit man am Layout iterieren kann, ohne den
// Bot zu deployen. Nutzt die ECHTEN Render-Funktionen + das echte CSS -> keine Drift zur Live-Seite.
import {renderConfigSeite} from '../dist/server/config.router.js';

// Absichtlich alle drei Feld-Zustände dabei (ok / leer / warnung), damit die Vorschau zeigt, wie ein
// nicht gesetztes bzw. ein auf einen gelöschten Kanal zeigendes Feld aussieht.
const html = renderConfigSeite({
    kanalFelder: [
        {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: '1336646220168433674', status: 'warnung'},
        {schluessel: 'twitch-kanal', label: 'Twitch-Benachrichtigungskanal', aktuelleId: 'c1', status: 'ok'},
        {schluessel: 'sport-kanal', label: 'Sport-Ankündigungskanal', aktuelleId: null, status: 'leer'},
        {schluessel: 'morgengruss-kanal', label: 'Morgengruß-Kanal', aktuelleId: 'c3', status: 'ok'},
    ],
    kanaele: [
        {id: 'c1', name: 'stream-alerts'},
        {id: 'c2', name: 'allgemein'},
        {id: 'c3', name: 'guten-morgen'},
        {id: 'c4', name: 'plausch'},
    ],
    rollen: [
        {id: 'r1', name: 'Abonnenten'},
        {id: 'r2', name: 'Streamer'},
        {id: 'r3', name: 'Zuschauer'},
    ],
    twitchRolle: {aktuelleId: 'r2', status: 'ok'},
    eventFelder: {datum: '2026-12-24', uhrzeit: '18:00', titel: 'Weihnachtstreffen'},
    mitglieder: [
        {id: 'm1', name: 'Tirsis', kilometer: 128.5},
        {id: 'm2', name: 'Zerix', kilometer: 0},
        {id: 'm3', name: 'Acaine', kilometer: 42},
    ],
    legacyKilometer: 1250,
    meilensteine: [
        {kilometers: 1000, text: 'Yay, gemeinsam 1000 km geschafft!', announced: true},
        {kilometers: 2000, text: 'Auf zur nächsten Etappe – 2000 km!', announced: false},
    ],
    // Alle vier Fälle der Emoji-Übersicht, damit die Vorschau zeigt, wie jeder aussieht.
    morgengrussEmojis: [
        {id: 'm1', name: 'Tirsis', gelernt: true, emoji: {art: 'unicode', zeichen: '🦊'}, aktuellerWert: '🦊'},
        {id: 'm2', name: 'Zerix', gelernt: true, emoji: {art: 'custom', url: 'https://cdn.discordapp.com/emojis/123.png', name: 'blahaj'}, aktuellerWert: '123'},
        {id: 'm3', name: 'Acaine', gelernt: false, emoji: {art: 'unicode', zeichen: '🌿'}, aktuellerWert: '🌿'},
        {id: 'm4', name: 'Verwaist', gelernt: true, emoji: {art: 'unbekannt', id: '999'}, aktuellerWert: '999'},
    ],
    emojiAuswahl: [
        {wert: '☀️', label: '☀️'},
        {wert: '🌿', label: '🌿'},
        {wert: '🦊', label: '🦊'},
        {wert: '123', label: ':blahaj:'},
    ],
    csrfToken: 'vorschau-token',
    meldung: {bereich: 'sport', text: 'Kilometerstand gesetzt.', art: 'ok'},
});

const ziel = path.join(process.cwd(), 'config-vorschau.html');
writeFileSync(ziel, html, 'utf-8');
console.log(`Vorschau geschrieben: ${ziel}`);
