import redisService from './redis.service.js';
import { htmlToText } from './news.service.js';
import { fetchLotgdHtml, LOTGD_BASE_URL } from './lotgd.service.js';

const LIST_URL = `${LOTGD_BASE_URL}/list.php`;
// Sicherheitskappe fürs Durchblättern; die Schleife stoppt ohnehin an der ersten nicht-vollen Seite.
const MAX_ROSTER_PAGES = 25;
const PAGE_SIZE = 100;
// Roster ändert sich langsam - kurz cachen, sonst 7+ Seiten-Fetches pro /charakter-Aufruf.
const ROSTER_CACHE_MS = 10 * 60 * 1000;

const KEYS = {
    link: (discordUserId: string) => `CHARACTER:LINK:${discordUserId}`,
    allLinks: 'CHARACTER:ALL_LINKS',
};

// Ein öffentlicher Charakter-Eintrag aus der Kriegerliste (list.php?op=bypage).
export interface CharacterEntry {
    name: string;      // voller Anzeigename inkl. level-/drachenabhängigem Titel-Präfix, z.B. "Centurio Acaine"
    gilde: string;     // '' wenn in keiner Gilde
    ort: string;
    level: string;
    rasse: string;
    geschlecht: string;
    lebt: boolean;
    zuletztDa: string; // "Heute", "5 Tage", ...
}

// Parst eine Roster-Seite in Charakter-Einträge. 8 Spalten inkl. "Zuletzt da"; Namen sind auf
// der Seite oft Buchstabe-je-Farb-<span> zerlegt (Regenbogennamen) - htmlToText fügt sie zusammen.
// null bei kaputtem Markup (Kopfzeile/Tabelle weg), [] bei einer leeren Seite.
export function parseRoster(html: string): CharacterEntry[] | null {
    // Ankern an der Kriegerlisten-Kopfzeile; die "Zuletzt da"-Spalte gibt es nur hier.
    const headIdx = html.search(/<tr class=['"]trhead['"]>[\s\S]*?Zuletzt da/i);
    if (headIdx === -1) return null;

    const tableEnd = html.indexOf('</table>', headIdx);
    const section = tableEnd === -1 ? html.slice(headIdx) : html.slice(headIdx, tableEnd);

    const rows = section.match(/<tr class=['"]tr(?:light|dark)['"]>[\s\S]*?<\/tr>/gi) ?? [];

    const entries: CharacterEntry[] = [];
    for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => htmlToText(m[1]).trim());
        if (cells.length < 8) continue;

        entries.push({
            gilde: cells[0],
            name: cells[1],
            ort: cells[2],
            level: cells[3],
            rasse: cells[4],
            geschlecht: cells[5],
            lebt: !/nein/i.test(cells[6]),
            zuletztDa: cells[7],
        });
    }

    return entries;
}

// Sucht einen Charakter im Roster. Der Roster zeigt "<Titel> <Name>", der Titel ändert sich mit
// Level/Drachentötungen - deshalb Suffix-Match auf Wortgrenze (exakter Name ODER endet auf " Name"),
// nicht der ganze String. Gespeichert/gesucht wird also der Kern-Name.
export function findInRoster(roster: CharacterEntry[], name: string): CharacterEntry | null {
    const needle = name.trim().toLowerCase();
    if (!needle) return null;

    return roster.find(entry => {
        const full = entry.name.toLowerCase();
        return full === needle || full.endsWith(` ${needle}`);
    }) ?? null;
}

class CharacterService {
    #rosterCache: { entries: CharacterEntry[]; at: number } | null = null;

    // Vollständiges Roster über alle Seiten, kurz gecacht. null nur bei Abruf-/Markup-Fehler
    // (nicht dasselbe wie "Charakter nicht gefunden" - das unterscheidet der Handler).
    async getRoster(): Promise<CharacterEntry[] | null> {
        if (this.#rosterCache && Date.now() - this.#rosterCache.at < ROSTER_CACHE_MS) {
            return this.#rosterCache.entries;
        }

        try {
            const all: CharacterEntry[] = [];
            for (let page = 1; page <= MAX_ROSTER_PAGES; page++) {
                const html = await fetchLotgdHtml(`${LIST_URL}?op=bypage&page=${page}`, `Kriegerliste Seite ${page}`);
                if (html === null) return null;

                const parsed = parseRoster(html);
                if (parsed === null) return null;

                all.push(...parsed);
                // Nicht-volle Seite = letzte Seite erreicht (passt sich an wachsenden Bestand an).
                if (parsed.length < PAGE_SIZE) break;
            }

            this.#rosterCache = { entries: all, at: Date.now() };
            return all;
        } catch (error) {
            console.error('Fehler beim Abrufen/Parsen des LotGD-Rosters:', error);
            return null;
        }
    }

    // Cache verwerfen (erzwingt Neuabruf) - für Tests und als Reserve für einen manuellen Refresh.
    clearCache(): void {
        this.#rosterCache = null;
    }

    async linkCharacter(discordUserId: string, characterName: string): Promise<void> {
        await redisService.set(KEYS.link(discordUserId), characterName);
        await redisService.addToList(KEYS.allLinks, discordUserId);
    }

    async getLinkedName(discordUserId: string): Promise<string | null> {
        return redisService.get(KEYS.link(discordUserId));
    }

    async unlinkCharacter(discordUserId: string): Promise<boolean> {
        const existing = await redisService.get(KEYS.link(discordUserId));
        if (!existing) return false;

        await redisService.delete(KEYS.link(discordUserId));
        await redisService.removeFromList(KEYS.allLinks, discordUserId);
        return true;
    }

    // Alle Verknüpfungen (Name ↔ Discord-User) - Basis für den geplanten Abgleich in /online und
    // /ereignisse ("taucht ein verknüpfter Charakter auf?").
    async getAllLinks(): Promise<{ discordUserId: string; name: string }[]> {
        const ids = await redisService.getList(KEYS.allLinks);
        const links: { discordUserId: string; name: string }[] = [];
        for (const discordUserId of ids) {
            const name = await redisService.get(KEYS.link(discordUserId));
            if (name) links.push({ discordUserId, name });
        }
        return links;
    }
}

export default new CharacterService();
