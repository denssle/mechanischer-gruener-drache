const NEWS_URL = 'https://www.lotgd.de/news.php';

export interface NewsItem {
    title: string;
    date: string;
    text: string;
    url: string;
}

const ENTITIES: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    '&auml;': 'ä', '&ouml;': 'ö', '&uuml;': 'ü', '&Auml;': 'Ä', '&Ouml;': 'Ö', '&Uuml;': 'Ü', '&szlig;': 'ß',
};

function decodeEntities(text: string): string {
    let result = text;
    for (const [entity, char] of Object.entries(ENTITIES)) {
        result = result.replaceAll(entity, char);
    }
    return result
        .replace(/&#0*39;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// LotGD verschachtelt den Text stark in <span class='colXXX'>-Farbtags und nutzt <br> für
// Zeilenumbrüche - hier zu lesbarem Plaintext machen.
export function htmlToText(html: string): string {
    return decodeEntities(
        html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    )
        .replace(/[ \t]+/g, ' ')
        .split('\n').map(line => line.trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Extrahiert den neuesten News-Eintrag. Jeder Eintrag ist als <a name='motdJJJJMMTTHHMMSS'>
// … <hr></p> eingefasst - der motd-Anker liefert das Datum direkt (kein Locale-Parsing nötig),
// das </p> ist die saubere Ende-Grenze.
export function parseLatestNews(html: string): NewsItem | null {
    const blockMatch = html.match(/<a name=['"]motd(\d{14})['"]>([\s\S]*?)<\/p>/i);
    if (!blockMatch) return null;

    const stamp = blockMatch[1];
    const block = blockMatch[2];

    const titleMatch = block.match(/<b>([\s\S]*?)<\/b>/i);
    const title = titleMatch ? htmlToText(titleMatch[1]) : 'News';

    // Body = alles hinter dem Datums-Span, bis zum abschließenden <hr>
    const afterDate = block.split(/<span class=['"]colLtCyan['"]>\d{4}-\d{2}-\d{2}[^<]*<\/span>/i)[1] ?? block;
    const text = htmlToText(afterDate.split(/<hr\s*\/?>/i)[0]);

    const date = `${stamp.slice(6, 8)}.${stamp.slice(4, 6)}.${stamp.slice(0, 4)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}`;

    return { title, date, text, url: NEWS_URL };
}

class NewsService {
    async getLatestNews(): Promise<NewsItem | null> {
        try {
            const response = await fetch(NEWS_URL, {
                headers: { 'User-Agent': 'MechanischerGruenerDrache-DiscordBot' }
            });

            if (!response.ok) {
                console.error(`Fehler beim Abrufen der LotGD-News: ${response.status} ${response.statusText}`);
                return null;
            }

            // Seite ist ISO-8859-1 kodiert - explizit dekodieren, sonst kaputte Umlaute.
            const buffer = await response.arrayBuffer();
            const html = new TextDecoder('iso-8859-1').decode(buffer);

            return parseLatestNews(html);
        } catch (error) {
            console.error('Fehler beim Abrufen/Parsen der LotGD-News:', error);
            return null;
        }
    }
}

export default new NewsService();
