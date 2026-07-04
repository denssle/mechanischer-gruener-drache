import { describe, it, expect, vi, afterEach } from 'vitest';

import newsService, { parseLatestNews, htmlToText } from './news.service.js';

const SAMPLE = `
<p id=''><a name='motd20260419084602'>
<a href="#" onClick="...">
<b><span class='colDkWhite'>Serverplot - </span><span class='colkhaki'>das gestohlene Zwergengold</span></b>
</a>
<br>
<span class='colsparkgray'>Reliktsammlerin Asur</span>
<span class='colLtCyan'>2026-04-19 08:46:02</span>
<br>
<span class='colmousegrey'>Auf den schwarzen Brettern ist ein neues Gesuch aufgetaucht. <br>In feiner Handschrift: <br></span><span class='coltomatoered'>~~~<br>S&ouml;ldner gesucht!<br></span>
<hr></p>
<p id=''><a name='motd20260101120000'><b>Alte News</b><span class='colLtCyan'>2026-01-01 12:00:00</span><br>Alter Text<hr></p>
`;

describe('news.service', () => {
    describe('parseLatestNews', () => {
        it('extrahiert Titel, Datum und Text des neuesten Eintrags', () => {
            const news = parseLatestNews(SAMPLE);

            expect(news).not.toBeNull();
            expect(news!.title).toBe('Serverplot - das gestohlene Zwergengold');
            expect(news!.date).toBe('19.04.2026 08:46');
            expect(news!.text).toContain('Auf den schwarzen Brettern');
            expect(news!.text).toContain('Söldner gesucht!'); // &ouml; dekodiert
            expect(news!.url).toContain('lotgd.de');
        });

        it('nimmt den ersten (neuesten) Eintrag, nicht den älteren', () => {
            const news = parseLatestNews(SAMPLE);

            expect(news!.text).not.toContain('Alter Text');
        });

        it('gibt null zurück wenn kein News-Block gefunden wird', () => {
            expect(parseLatestNews('<html>keine news hier</html>')).toBeNull();
        });
    });

    describe('htmlToText', () => {
        it('wandelt <br> in Zeilenumbrüche und entfernt Tags', () => {
            expect(htmlToText("<span class='x'>Hallo<br>Welt</span>")).toBe('Hallo\nWelt');
        });

        it('dekodiert Umlaut- und &-Entities', () => {
            expect(htmlToText('Gr&uuml;&szlig;e &amp; mehr')).toBe('Grüße & mehr');
        });
    });

    describe('getLatestNews', () => {
        afterEach(() => vi.unstubAllGlobals());

        it('dekodiert ISO-8859-1-Bytes korrekt und parst den Eintrag', async () => {
            const latin1 = `<a name='motd20260419084602'><b>Grüße-Test</b><span class='colLtCyan'>2026-04-19 08:46:02</span><br>Söldner gesucht<hr></p>`;
            const bytes = Uint8Array.from(latin1, c => c.charCodeAt(0) & 0xff);
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer }));

            const news = await newsService.getLatestNews();

            expect(news!.title).toBe('Grüße-Test');
            expect(news!.text).toContain('Söldner');
        });

        it('gibt null bei einer nicht-ok Response zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));

            expect(await newsService.getLatestNews()).toBeNull();
        });

        it('gibt null bei einem Netzwerkfehler zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

            expect(await newsService.getLatestNews()).toBeNull();
        });
    });
});
