import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLotgdHtml } from './lotgd.service.js';

const fetchMock = vi.fn();

describe('fetchLotgdHtml', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('dekodiert die Antwort als ISO-8859-1 (Umlaute kämen mit UTF-8 kaputt an)', async () => {
        // "Drachentöter" mit Latin-1-Byte 0xF6 für "ö" - als UTF-8 gelesen wäre das ein Ersatzzeichen.
        const latin1 = new Uint8Array([0x44, 0x72, 0x61, 0x63, 0x68, 0x65, 0x6E, 0x74, 0xF6, 0x74, 0x65, 0x72]);
        fetchMock.mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(latin1.buffer),
        });

        const html = await fetchLotgdHtml('https://www.lotgd.de/news.php', 'News');

        expect(html).toBe('Drachentöter');
    });

    it('schickt den Bot-User-Agent mit (der Standard-Fetch-UA bekommt 403)', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        });

        await fetchLotgdHtml('https://www.lotgd.de/list.php', 'Kriegerliste');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://www.lotgd.de/list.php');
        expect(options.headers['User-Agent']).toContain('MechanischerGruenerDrache');
    });

    it('gibt bei nicht-ok Response null zurück und loggt den Kontext', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

        const html = await fetchLotgdHtml('https://www.lotgd.de/news.php', 'News');

        expect(html).toBeNull();
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('News'));
        consoleError.mockRestore();
    });

    it('reicht Netzwerkfehler durch (die Services fangen sie in ihrem eigenen try/catch)', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(fetchLotgdHtml('https://www.lotgd.de/news.php', 'News')).rejects.toThrow('ECONNREFUSED');
    });
});
