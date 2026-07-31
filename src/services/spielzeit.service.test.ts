import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import spielzeitService, { parseSekundenBisTageswechsel } from './spielzeit.service.js';

// Ausschnitt echten about.php?op=setup-Markups: Label und Wert stehen je auf eigener Zeile,
// die Restdauer hängt in Klammern hinter der Uhrzeit.
const SAMPLE = `
<tr class='trdark'><td valign='top'>
Tagesdauer
</td><td valign='top'>
6 hours
</td></tr>
<tr class='trdark'><td valign='top'>
Aktuelle Server Zeit
</td><td valign='top'>
2026-07-31 03:25:27 pm
</td></tr>
<tr class='trlight'><td valign='top'>
Letzter neuer Tag
</td><td valign='top'>
10:00:00 am
</td></tr>
<tr class='trdark'><td valign='top'>
Nächster Tageswechsel
</td><td valign='top'>
04:00:00 pm (00h 34m 33s)
</td></tr>
`;

describe('spielzeit.service', () => {
    describe('parseSekundenBisTageswechsel', () => {
        it('liest die Restdauer aus der Klammer hinter dem Tageswechsel', () => {
            expect(parseSekundenBisTageswechsel(SAMPLE)).toBe(34 * 60 + 33);
        });

        it('versteht den Umlaut auch als HTML-Entity', () => {
            const html = SAMPLE.replace('Nächster', 'N&auml;chster');

            expect(parseSekundenBisTageswechsel(html)).toBe(34 * 60 + 33);
        });

        it('rechnet Stunden mit', () => {
            const html = SAMPLE.replace('00h 34m 33s', '03h 34m 12s');

            expect(parseSekundenBisTageswechsel(html)).toBe(3 * 3600 + 34 * 60 + 12);
        });

        it('gibt null zurück, wenn die Zeile fehlt (Markup geändert)', () => {
            expect(parseSekundenBisTageswechsel('<html>irgendwas anderes</html>')).toBeNull();
        });

        it('gibt null zurück, wenn die Restdauer fehlt', () => {
            const html = SAMPLE.replace(' (00h 34m 33s)', '');

            expect(parseSekundenBisTageswechsel(html)).toBeNull();
        });

        // Die Uhrzeit davor darf nicht als Dauer durchgehen - nur die Klammer zählt.
        it('greift nicht auf eine andere Zeile davor zu', () => {
            const html = `Letzter neuer Tag (01h 00m 00s)\nNächster Tageswechsel\n04:00:00 pm (00h 34m 33s)`;

            expect(parseSekundenBisTageswechsel(html)).toBe(34 * 60 + 33);
        });
    });

    describe('getTageswechsel', () => {
        const fetchMock = vi.fn();

        beforeEach(() => {
            spielzeitService.clearCache();
            fetchMock.mockReset();
            vi.stubGlobal('fetch', fetchMock);
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
        });

        // lotgd.de liefert ISO-8859-1 - die Antwort also auch so kodieren, sonst käme aus dem
        // TextDecoder in fetchLotgdHtml "NÃ¤chster" statt "Nächster".
        function antworte(html: string) {
            const bytes = new Uint8Array(Buffer.from(html, 'latin1'));
            fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });
        }

        it('rechnet die Restdauer auf die eigene Uhr - unabhängig von der Server-Zeitzone', async () => {
            antworte(SAMPLE);
            const vorher = Date.now();

            const ziel = await spielzeitService.getTageswechsel();

            expect(ziel).not.toBeNull();
            expect(ziel!).toBeGreaterThanOrEqual(vorher + (34 * 60 + 33) * 1000);
            expect(ziel!).toBeLessThan(vorher + (34 * 60 + 34) * 1000 + 5000);
        });

        it('cacht den Zeitpunkt, statt bei jedem Aufruf neu abzurufen', async () => {
            antworte(SAMPLE);

            const erst = await spielzeitService.getTageswechsel();
            const zweit = await spielzeitService.getTageswechsel();

            expect(zweit).toBe(erst);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('gibt null zurück, wenn die Seite nicht abrufbar ist', async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

            expect(await spielzeitService.getTageswechsel()).toBeNull();
        });

        it('gibt null zurück, statt bei einem Netzwerkfehler zu werfen', async () => {
            fetchMock.mockRejectedValue(new Error('Netzwerk weg'));

            expect(await spielzeitService.getTageswechsel()).toBeNull();
        });

        it('gibt null zurück und cacht nicht, wenn das Markup nicht mehr passt', async () => {
            antworte('<html>umgebaut</html>');

            expect(await spielzeitService.getTageswechsel()).toBeNull();
            expect(await spielzeitService.getTageswechsel()).toBeNull();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });
});
