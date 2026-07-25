import {writeFileSync} from 'fs';
import path from 'path';
// Import aus dem gebauten dist/ (declaration: true -> voll typisiert). Dev-Werkzeug: rendert die
// /config-Seite mit Beispieldaten in eine HTML-Datei, damit man am Layout iterieren kann, ohne den
// Bot zu deployen. Nutzt die ECHTEN Render-Funktionen + das echte CSS -> keine Drift zur Live-Seite.
import {renderConfigSeite} from '../dist/server/config.router.js';

const html = renderConfigSeite({
    einstellungen: [
        {label: 'Twitch-Benachrichtigungskanal', wert: '#stream-alerts', status: 'ok'},
        {label: 'Twitch-Benachrichtigungsrolle', wert: '@Streamer', status: 'ok'},
        {label: 'Sport-Ankündigungskanal', wert: 'nicht gesetzt', status: 'leer'},
        {label: 'Protokoll-Kanal', wert: 'gesetzt (1336646220168433674), aber nicht abrufbar', status: 'warnung'},
        {label: 'Morgengruß-Kanal', wert: '#guten-morgen', status: 'ok'},
        {label: 'Nächstes Event', wert: '24.12.2026, 18:00 – Weihnachtstreffen', status: 'ok'},
    ],
    kanalFelder: [
        {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'c2'},
        {schluessel: 'twitch-kanal', label: 'Twitch-Benachrichtigungskanal', aktuelleId: 'c1'},
        {schluessel: 'sport-kanal', label: 'Sport-Ankündigungskanal', aktuelleId: null},
        {schluessel: 'morgengruss-kanal', label: 'Morgengruß-Kanal', aktuelleId: 'c3'},
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
    twitchRolleId: 'r2',
    csrfToken: 'vorschau-token',
    gespeichert: false,
});

const ziel = path.join(process.cwd(), 'config-vorschau.html');
writeFileSync(ziel, html, 'utf-8');
console.log(`Vorschau geschrieben: ${ziel}`);
