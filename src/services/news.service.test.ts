import { describe, it, expect, vi, afterEach } from 'vitest';

import newsService, { parseLatestNews, parseGameEvents, htmlToText } from './news.service.js';

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

const SEP = `<div align='center'><span class='colDkGreen'>-=-</span><span class='colLtGreen'>=-=</span><span class='colDkGreen'>-=-</span></div>`;
// Der letzte Trenner der echten Seite trägt ein verirrtes </span> direkt hinter dem <div>.
const SEP_BROKEN = `<div align='center'></span><span class='colDkGreen'>-=-</span><span class='colLtGreen'>=-=</span></div>`;

const SAMPLE_EVENTS = `
<div align='center'><b><span class='colLtBlue'>Neuigkeiten am Thu, Jul 9, 2026 (Nachrichten 1 - 50 of 628)</span></b></div>
${SEP}
<span class='colLtMagenta'>Bauernjunge Xandrax</span><span class='colDkMagenta'> wurde von </span><span class='colDkGreen'>Gruselschleim </span><span class='colDkMagenta'>get&ouml;tet.<br>
</span><span class='colDkMagenta'>Man h&ouml;rte ihn sagen, &quot;Nein!&quot;<br></span>
${SEP_BROKEN}
Herumtreiberin Zalia <span class='colDkBrown'>hat sich bis auf die Knochen blamiert.</span><br>
${SEP}
<span class='colLtWhite'>Richter Treva wurde von </span><span class='colLtRed'>Ramius</span><span class='colLtWhite'> wiederbelebt.<br></span>
${SEP_BROKEN}
</div>
<div id="petition" class="petitionclass">
<b>Online letzte 30 Minuten (9 Spieler):</b><br><span class='colLtYellow'>Gutsherr Bonko</span>
</div>
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

    describe('parseGameEvents', () => {
        it('extrahiert die Ereignisse in Reihenfolge, ohne Trenner und Farbtags', () => {
            const parsed = parseGameEvents(SAMPLE_EVENTS);

            expect(parsed).not.toBeNull();
            expect(parsed!.events).toEqual([
                'Bauernjunge Xandrax wurde von Gruselschleim getötet. Man hörte ihn sagen, "Nein!"',
                'Herumtreiberin Zalia hat sich bis auf die Knochen blamiert.',
                'Richter Treva wurde von Ramius wiederbelebt.',
            ]);
        });

        it('übersetzt das englische Überschriften-Datum ins deutsche Format', () => {
            expect(parseGameEvents(SAMPLE_EVENTS)!.date).toBe('09.07.2026');
        });

        it('lässt ein unbekanntes Datumsformat unverändert stehen', () => {
            const html = SAMPLE_EVENTS.replace('Thu, Jul 9, 2026', 'irgendwann');

            expect(parseGameEvents(html)!.date).toBe('irgendwann');
        });

        it('schneidet die Seitenleiste hinter den Ereignissen ab', () => {
            const parsed = parseGameEvents(SAMPLE_EVENTS);

            expect(parsed!.events.join(' ')).not.toContain('Gutsherr Bonko');
            expect(parsed!.events.join(' ')).not.toContain('Online letzte 30 Minuten');
        });

        it('gibt null zurück wenn die Überschrift fehlt', () => {
            expect(parseGameEvents('<html>nichts</html>')).toBeNull();
        });

        it('gibt null zurück wenn die Überschrift da ist, aber kein Ereignis folgt', () => {
            expect(parseGameEvents(`<span>Neuigkeiten am Thu, Jul 9, 2026</span>${SEP}`)).toBeNull();
        });
    });

    describe('htmlToText', () => {
        it('wandelt <br> in Zeilenumbrüche und entfernt Tags', () => {
            expect(htmlToText("<span class='x'>Hallo<br>Welt</span>")).toBe('Hallo\nWelt');
        });

        it('dekodiert Umlaut- und &-Entities', () => {
            expect(htmlToText('Gr&uuml;&szlig;e &amp; mehr')).toBe('Grüße & mehr');
        });

        it('dekodiert weitere Latin-1-Akzentbuchstaben (z.B. in Spielernamen)', () => {
            expect(htmlToText('&Uacute;tlaga N&aacute;hea')).toBe('Útlaga Náhea');
            expect(htmlToText('&Oslash;rn &ccedil;a')).toBe('Ørn ça');
        });

        it('dekodiert numerische Entities dezimal und hexadezimal', () => {
            expect(htmlToText('&#218;tlaga')).toBe('Útlaga');
            expect(htmlToText('&#xDA;tlaga')).toBe('Útlaga');
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

    describe('getGameEvents', () => {
        afterEach(() => vi.unstubAllGlobals());

        it('dekodiert ISO-8859-1-Bytes korrekt und parst die Ereignisse', async () => {
            const latin1 = `Neuigkeiten am Thu, Jul 9, 2026<div align='center'>-=-</div>Zalia wurde get&ouml;tet.<div align='center'>-=-</div>`;
            const bytes = Uint8Array.from(latin1, c => c.charCodeAt(0) & 0xff);
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer }));

            const parsed = await newsService.getGameEvents();

            expect(parsed!.date).toBe('09.07.2026');
            expect(parsed!.events).toEqual(['Zalia wurde getötet.']);
        });

        it('gibt null bei einer nicht-ok Response zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));

            expect(await newsService.getGameEvents()).toBeNull();
        });

        it('gibt null bei einem Netzwerkfehler zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

            expect(await newsService.getGameEvents()).toBeNull();
        });
    });
});
