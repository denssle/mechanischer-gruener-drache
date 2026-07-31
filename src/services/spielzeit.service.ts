import { fetchLotgdHtml, LOTGD_BASE_URL } from './lotgd.service.js';

// about.php?op=setup ist ohne Login abrufbar (AllowAnonymous) und nennt im Abschnitt
// "Nützliche Information" die Restzeit bis zum nächsten Tageswechsel im Klartext.
const ABOUT_URL = `${LOTGD_BASE_URL}/about.php?op=setup`;

// Der Zielzeitpunkt liegt innerhalb eines Spieltags fest (Tagesdauer 6 h), der Cache dürfte
// also deutlich länger halten. 15 Minuten sind trotzdem die Obergrenze, damit eine vom
// Betreiber geänderte Tagesdauer nicht stundenlang falsch angezeigt wird.
const CACHE_MS = 15 * 60 * 1000;

// Liest die Restdauer bis zum nächsten Tageswechsel in Sekunden. Die Seite liefert die Zeile
// "Nächster Tageswechsel | 04:00:00 pm (00h 34m 33s)" - die Dauer in Klammern ist alles, was
// wir brauchen: als *Dauer* ist sie unabhängig von der Zeitzone des Spielservers, wir addieren
// sie einfach auf unsere eigene Uhr. null, wenn lotgd.de sein Markup ändert (fragil by design).
export function parseSekundenBisTageswechsel(html: string): number | null {
    // fetchLotgdHtml dekodiert ISO-8859-1, das ä steht also als Zeichen da - die Entity-Form
    // trotzdem mitnehmen, sie kostet nichts und die Seite mischt beide Schreibweisen.
    const anchor = html.search(/N(?:ä|&auml;)chster Tageswechsel/i);
    if (anchor === -1) return null;

    // Label und Wert stehen in getrennten Zellen, dazwischen liegt etwas Markup.
    const match = html.slice(anchor, anchor + 300).match(/\((\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s\)/i);
    if (!match) return null;

    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

class SpielzeitService {
    #cache: { zielMs: number; at: number } | null = null;

    // Zeitpunkt des nächsten Tageswechsels als Unix-Zeit in Millisekunden, null wenn der Abruf
    // oder das Parsen scheitert. Gecacht wird der *absolute* Moment statt der Restdauer - der
    // veraltet beim Liegenlassen nicht, sondern gilt einfach bis er vorbei ist.
    async getTageswechsel(): Promise<number | null> {
        const cache = this.#cache;
        if (cache && Date.now() - cache.at < CACHE_MS && cache.zielMs > Date.now()) {
            return cache.zielMs;
        }

        try {
            const html = await fetchLotgdHtml(ABOUT_URL, 'Spielzeit');
            if (!html) return null;

            const sekunden = parseSekundenBisTageswechsel(html);
            if (sekunden === null) {
                console.error('Konnte den nächsten Tageswechsel nicht aus about.php lesen (Markup geändert?)');
                return null;
            }

            const zielMs = Date.now() + sekunden * 1000;
            this.#cache = { zielMs, at: Date.now() };
            return zielMs;
        } catch (error) {
            console.error('Fehler beim Abrufen/Parsen der LotGD-Spielzeit:', error);
            return null;
        }
    }

    // Cache verwerfen (erzwingt Neuabruf) - für Tests, Muster wie characterService.clearCache().
    clearCache(): void {
        this.#cache = null;
    }
}

export default new SpielzeitService();
