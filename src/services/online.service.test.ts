import { describe, it, expect, vi, afterEach } from 'vitest';

import onlineService, { parseOnlinePlayers, parseRecentlyOnline } from './online.service.js';

// Ausschnitt echten list.php-Markups: eine Gilde (<CdF>), ein Regenbogen-Name (Buchstabe je
// Farb-<span>), ein toter Charakter (Lebt = Nein) und ein Charakter ohne Gilde (&nbsp;).
const SAMPLE = `
<div align='center'>
<span class='colLtWhite'>Folgende Wyrml&auml;nder sind gerade eingeloggt: ( 3 Spieler )<br>
</span>
</div>
<table border='0' cellpadding='2' cellspacing='1' bgcolor='#999999' align='center'><tr class='trhead'><td>Gilde</td><td>Name</td><td>Ort</td><td>Level</td><td>Rasse</td><td>Geschlecht</td><td>Lebt</td></tr>
<tr class='trlight'><td>&nbsp;</td><td><span class='colLtWhite'>Bauernm&auml;dchen Cvetanka</span></td><td><span class='colLtWhite'>Glorfindal</span></td><td>&nbsp;<span class='colLtYellow'>14</span></td><td><span class='colLtWhite'>Echse</span></td><td>&nbsp;Weiblich</td><td>&nbsp;<span class='colDkBlue'>Ja</span></td></tr><tr class='trdark'><td><span class='colLtWhite'>&lt;</span><span class='colDkGreen'>CdF</span><span class='colLtWhite'>&gt;</span></td><td><span class='colLtWhite'></span><span style="color: #000000">K</span><span style="color: #660000">a</span><span style="color: #990000">l</span><span style="color: #CC0000">i</span><span style="color: #990000">s</span><span style="color: #660000">ha</span></td><td><span class='colLtWhite'>Romar</span></td><td>&nbsp;<span class='colLtYellow'>5</span></td><td><span class='colLtWhite'>Mensch</span></td><td>&nbsp;Weiblich</td><td>&nbsp;<span class='colDkBlue'>Ja</span></td></tr><tr class='trlight'><td>&nbsp;</td><td><span class='colLtWhite'>Legion&auml;r Outremer</span></td><td><span class='colLtWhite'>Romar</span></td><td>&nbsp;<span class='colLtYellow'>12</span></td><td><span class='colLtWhite'>Mensch</span></td><td>&nbsp;M&auml;nnlich</td><td>&nbsp;<span class='colLtRed'>Nein</span></td></tr>
</table>
<div id="playerstatsfull" class="stats">
<b>Online letzte 30 Minuten (4 Spieler):</b><br>
</span></span><span class='colLtYellow'>Bauernm&auml;dchen Cvetanka<br>
</span></span><span class='colLtYellow'></span><span style="color: #caffee">Lichtelfe </span><span style="color: #caffee">Xara</span><br>
<span class='colLtYellow'>Legion&auml;r Outremer</span><br>
<span class='colLtYellow'>&Uacute;tlaga Nahea</span><br>
</div>
`;

describe('online.service', () => {
    describe('parseOnlinePlayers', () => {
        it('parst Name, Ort, Level, Rasse und Lebt-Status aller Zeilen', () => {
            const players = parseOnlinePlayers(SAMPLE);

            expect(players).not.toBeNull();
            expect(players!).toHaveLength(3);
            expect(players![0]).toEqual({
                gilde: '', name: 'Bauernmädchen Cvetanka', ort: 'Glorfindal',
                level: '14', rasse: 'Echse', lebt: true,
            });
        });

        it('fügt Regenbogen-Namen (Buchstabe je Farb-Span) wieder zusammen', () => {
            const players = parseOnlinePlayers(SAMPLE);

            expect(players![1].name).toBe('Kalisha');
        });

        it('liest die Gilde inkl. der <>-Klammern, leere Gilde wird zu ""', () => {
            const players = parseOnlinePlayers(SAMPLE);

            expect(players![1].gilde).toBe('<CdF>');
            expect(players![0].gilde).toBe('');
        });

        it('markiert tote Charaktere über die Lebt-Spalte', () => {
            const players = parseOnlinePlayers(SAMPLE);

            expect(players![2].lebt).toBe(false);
            expect(players![0].lebt).toBe(true);
        });

        it('gibt [] zurück wenn die Tabelle da ist, aber keine Spieler eingeloggt sind', () => {
            const empty = SAMPLE.replace(/<tr class='tr(light|dark)'>[\s\S]*?<\/tr>/g, '');

            expect(parseOnlinePlayers(empty)).toEqual([]);
        });

        it('gibt null zurück wenn der "gerade eingeloggt"-Anker fehlt', () => {
            expect(parseOnlinePlayers('<html>keine liste</html>')).toBeNull();
        });
    });

    describe('parseRecentlyOnline', () => {
        it('liefert die Namen der letzten 30 Minuten, Regenbogen-Namen zusammengefügt', () => {
            const recent = parseRecentlyOnline(SAMPLE);

            expect(recent).toEqual(['Bauernmädchen Cvetanka', 'Lichtelfe Xara', 'Legionär Outremer', 'Útlaga Nahea']);
        });

        it('gibt null zurück wenn der Abschnitt fehlt', () => {
            expect(parseRecentlyOnline('<html>nichts</html>')).toBeNull();
        });
    });

    describe('getOnline', () => {
        afterEach(() => vi.unstubAllGlobals());

        it('dekodiert ISO-8859-1-Bytes korrekt und parst beide Listen', async () => {
            const bytes = Uint8Array.from(SAMPLE, c => c.charCodeAt(0) & 0xff);
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer }));

            const data = await onlineService.getOnline();

            expect(data!.players).toHaveLength(3);
            expect(data!.players[0].name).toBe('Bauernmädchen Cvetanka');
            expect(data!.recent).toContain('Lichtelfe Xara');
        });

        it('gibt null bei einer nicht-ok Response zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));

            expect(await onlineService.getOnline()).toBeNull();
        });

        it('gibt null bei einem Netzwerkfehler zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

            expect(await onlineService.getOnline()).toBeNull();
        });
    });
});
