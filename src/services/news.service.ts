const NEWS_URL = 'https://www.lotgd.de/news.php';

export interface NewsItem {
    title: string;
    date: string;
    text: string;
    url: string;
}

// Der zweite Teil von news.php: das Ingame-Ereignislog ("Neuigkeiten am <Datum>"),
// also Spielgeschehen (wer wurde von wem getötet, wiederbelebt, blamiert …) - im
// Gegensatz zu den NewsItem-Ankündigungen darüber.
export interface GameEvents {
    date: string;
    events: string[];
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

const MONTHS: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

// Die Überschrift nennt das Datum englisch ("Thu, Jul 9, 2026") - für den deutschen
// Bot ins gewohnte Format bringen. Unbekanntes Format bleibt unverändert stehen.
function formatEventDate(raw: string): string {
    const match = raw.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);
    const month = match ? MONTHS[match[1]] : undefined;
    if (!match || !month) return raw.trim();

    return `${match[2].padStart(2, '0')}.${month}.${match[3]}`;
}

// Trennt die Ereignisse: <div align='center'>…-=-=-…</div> steht vor jedem und hinter dem letzten.
const EVENT_SEPARATOR = /<div align=['"]center['"]>[\s\S]*?-=-[\s\S]*?<\/div>/gi;

// Extrahiert das Ingame-Ereignislog unterhalb der News. Beginnt bei der Überschrift
// "Neuigkeiten am <Datum>", endet vor der Seitenleiste (<div id="petition">).
export function parseGameEvents(html: string): GameEvents | null {
    const headingMatch = html.match(/Neuigkeiten am ([^<(]+)/i);
    if (!headingMatch) return null;

    // Hinter dem Datum steht noch der Paginierungs-Rest ("(Nachrichten 1 - 50 of 628)") in
    // derselben Überschrift - erst ab deren </div> beginnen die Ereignisse.
    const afterHeading = html.slice(headingMatch.index! + headingMatch[0].length);
    const headingEnd = afterHeading.indexOf('</div>');
    const afterHeadingDiv = headingEnd === -1 ? afterHeading : afterHeading.slice(headingEnd + '</div>'.length);

    const section = afterHeadingDiv.split(/<div id=['"]petition['"]/i)[0];

    const events = section
        .split(EVENT_SEPARATOR)
        .map(part => htmlToText(part).replace(/\n+/g, ' ').trim())
        .filter(part => part.length > 0);

    if (events.length === 0) return null;

    return { date: formatEventDate(headingMatch[1]), events, url: NEWS_URL };
}

class NewsService {
    // Seite ist ISO-8859-1 kodiert - explizit dekodieren, sonst kaputte Umlaute.
    private async fetchHtml(): Promise<string | null> {
        const response = await fetch(NEWS_URL, {
            headers: { 'User-Agent': 'MechanischerGruenerDrache-DiscordBot' }
        });

        if (!response.ok) {
            console.error(`Fehler beim Abrufen der LotGD-News: ${response.status} ${response.statusText}`);
            return null;
        }

        const buffer = await response.arrayBuffer();
        return new TextDecoder('iso-8859-1').decode(buffer);
    }

    async getLatestNews(): Promise<NewsItem | null> {
        try {
            const html = await this.fetchHtml();
            return html ? parseLatestNews(html) : null;
        } catch (error) {
            console.error('Fehler beim Abrufen/Parsen der LotGD-News:', error);
            return null;
        }
    }

    async getGameEvents(): Promise<GameEvents | null> {
        try {
            const html = await this.fetchHtml();
            return html ? parseGameEvents(html) : null;
        } catch (error) {
            console.error('Fehler beim Abrufen/Parsen der LotGD-Ereignisse:', error);
            return null;
        }
    }
}

export default new NewsService();
