import { htmlToText } from './news.service.js';

const LIST_URL = 'https://www.lotgd.de/list.php';

// Ein gerade eingeloggter Charakter aus der Haupttabelle von list.php.
export interface OnlinePlayer {
    name: string;
    ort: string;
    level: string;
    rasse: string;
    gilde: string; // '' wenn der Charakter in keiner Gilde ist
    lebt: boolean;
}

// Extrahiert die Haupttabelle "Folgende Wyrmländer sind gerade eingeloggt" mit den vollen
// Spalten (Gilde, Name, Ort, Level, Rasse, Geschlecht, Lebt). Namen sind auf der Seite oft
// Buchstabe-für-Buchstabe in Farb-<span>s zerlegt - htmlToText fügt sie wieder zusammen.
// Rückgabe: [] wenn niemand eingeloggt ist (Struktur ok, nur leer), null bei kaputtem Markup.
export function parseOnlinePlayers(html: string): OnlinePlayer[] | null {
    const anchor = html.search(/gerade eingeloggt/i);
    if (anchor === -1) return null;

    const tableMatch = html.slice(anchor).match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return null;

    // Datenzeilen sind trlight/trdark; die Kopfzeile (trhead) fällt bewusst raus.
    const rows = tableMatch[1].match(/<tr class=['"]tr(?:light|dark)['"]>[\s\S]*?<\/tr>/gi) ?? [];

    const players: OnlinePlayer[] = [];
    for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => htmlToText(m[1]).trim());
        if (cells.length < 7) continue;

        players.push({
            gilde: cells[0],
            name: cells[1],
            ort: cells[2],
            level: cells[3],
            rasse: cells[4],
            // cells[5] = Geschlecht (aktuell nicht angezeigt)
            lebt: !/nein/i.test(cells[6]),
        });
    }

    return players;
}

// Extrahiert die Seitenleiste "Online letzte 30 Minuten" - nur die Namen, größeres Zeitfenster
// als die Haupttabelle. Der Block steht auf der Seite doppelt (Desktop/Mobil); der erste reicht.
export function parseRecentlyOnline(html: string): string[] | null {
    const match = html.match(/Online letzte 30 Minuten[^<]*<\/b><br>([\s\S]*?)<\/div>/i);
    if (!match) return null;

    return match[1]
        .split(/<br\s*\/?>/i)
        .map(segment => htmlToText(segment).trim())
        .filter(segment => segment.length > 0);
}

class OnlineService {
    // Seite ist ISO-8859-1 kodiert - explizit dekodieren, sonst kaputte Umlaute.
    private async fetchHtml(): Promise<string | null> {
        const response = await fetch(LIST_URL, {
            headers: { 'User-Agent': 'MechanischerGruenerDrache-DiscordBot' }
        });

        if (!response.ok) {
            console.error(`Fehler beim Abrufen der LotGD-Kriegerliste: ${response.status} ${response.statusText}`);
            return null;
        }

        const buffer = await response.arrayBuffer();
        return new TextDecoder('iso-8859-1').decode(buffer);
    }

    // Holt beide Listen aus demselben Abruf (ein Netz-Call): die reiche "gerade eingeloggt"-
    // Tabelle und die 30-Minuten-Namen. null nur, wenn schon der Abruf/das Markup scheitert.
    async getOnline(): Promise<{ players: OnlinePlayer[]; recent: string[] } | null> {
        try {
            const html = await this.fetchHtml();
            if (!html) return null;

            const players = parseOnlinePlayers(html);
            if (players === null) return null;

            return { players, recent: parseRecentlyOnline(html) ?? [] };
        } catch (error) {
            console.error('Fehler beim Abrufen/Parsen der LotGD-Kriegerliste:', error);
            return null;
        }
    }
}

export default new OnlineService();
