import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const redis = vi.hoisted(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    addToList: vi.fn(),
    removeFromList: vi.fn(),
    getList: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({ default: redis }));

import characterService, { parseRoster, findInRoster } from './character.service.js';

// Ausschnitt echten Roster-Markups (list.php?op=bypage): 8 Spalten inkl. "Zuletzt da", ein
// Titel-Praefix ("Centurio Acaine"), ein Regenbogen-Name mit Gilde (<CdF>), ein toter Charakter.
const SAMPLE = `
<table><tr class='trhead'><td>Gilde</td><td>Name</td><td>Ort</td><td>Level</td><td>Rasse</td><td>Geschlecht</td><td>Lebt</td><td>Zuletzt da</td></tr>
<tr class='trlight'><td>&nbsp;</td><td><span class='colLtWhite'>Centurio Acaine</span></td><td><span class='colLtWhite'>Im Haus</span></td><td>&nbsp;<span class='colLtYellow'>5</span></td><td><span class='colLtWhite'>Mensch</span></td><td>&nbsp;M&auml;nnlich</td><td>&nbsp;<span class='colDkBlue'>Ja</span></td><td>&nbsp;5 Tage</td></tr><tr class='trdark'><td><span class='colLtWhite'>&lt;</span><span class='colDkGreen'>CdF</span><span class='colLtWhite'>&gt;</span></td><td><span class='colLtWhite'></span><span style="color:#000">K</span><span style="color:#600">a</span><span style="color:#900">l</span><span style="color:#c00">i</span><span style="color:#900">s</span><span style="color:#600">ha</span></td><td><span class='colLtWhite'>Romar</span></td><td>&nbsp;<span class='colLtYellow'>5</span></td><td><span class='colLtWhite'>Mensch</span></td><td>&nbsp;Weiblich</td><td>&nbsp;<span class='colLtRed'>Nein</span></td><td>&nbsp;Heute</td></tr><tr class='trlight'><td>&nbsp;</td><td><span class='colLtWhite'>Abraxar</span></td><td><span class='colLtWhite'>Glorfindal</span></td><td>&nbsp;<span class='colLtYellow'>15</span></td><td><span class='colLtWhite'>Elf</span></td><td>&nbsp;M&auml;nnlich</td><td>&nbsp;<span class='colLtRed'>Nein</span></td><td>&nbsp;7 Tage</td></tr>
</table>
`;

describe('character.service', () => {
    describe('parseRoster', () => {
        it('parst alle 8 Spalten inkl. Zuletzt-da', () => {
            const roster = parseRoster(SAMPLE);

            expect(roster).not.toBeNull();
            expect(roster!).toHaveLength(3);
            expect(roster![0]).toEqual({
                gilde: '', name: 'Centurio Acaine', ort: 'Im Haus', level: '5',
                rasse: 'Mensch', geschlecht: 'Männlich', lebt: true, zuletztDa: '5 Tage',
            });
        });

        it('fügt Regenbogen-Namen zusammen und liest die Gilde', () => {
            const roster = parseRoster(SAMPLE);

            expect(roster![1].name).toBe('Kalisha');
            expect(roster![1].gilde).toBe('<CdF>');
            expect(roster![1].lebt).toBe(false);
        });

        it('gibt null zurück wenn die Kriegerlisten-Kopfzeile fehlt', () => {
            expect(parseRoster('<html>keine liste</html>')).toBeNull();
        });
    });

    describe('findInRoster', () => {
        const roster = parseRoster(SAMPLE)!;

        it('matcht den Kern-Namen als Suffix trotz Titel-Präfix', () => {
            expect(findInRoster(roster, 'Acaine')!.name).toBe('Centurio Acaine');
            expect(findInRoster(roster, 'acaine')!.name).toBe('Centurio Acaine'); // case-insensitiv
        });

        it('matcht einen Namen ohne Titel exakt', () => {
            expect(findInRoster(roster, 'Abraxar')!.name).toBe('Abraxar');
        });

        it('gibt null bei unbekanntem oder leerem Namen zurück', () => {
            expect(findInRoster(roster, 'Nichtvorhanden')).toBeNull();
            expect(findInRoster(roster, '  ')).toBeNull();
        });
    });

    describe('getRoster', () => {
        beforeEach(() => characterService.clearCache());
        afterEach(() => vi.unstubAllGlobals());

        it('dekodiert ISO-8859-1 und parst die Seite (stoppt an nicht-voller Seite)', async () => {
            const bytes = Uint8Array.from(SAMPLE, c => c.charCodeAt(0) & 0xff);
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });
            vi.stubGlobal('fetch', fetchMock);

            const roster = await characterService.getRoster();

            expect(roster).toHaveLength(3);
            expect(roster![0].name).toBe('Centurio Acaine');
            expect(fetchMock).toHaveBeenCalledTimes(1); // 3 < 100 Zeilen => nur eine Seite
        });

        it('gibt null bei einer nicht-ok Response zurück', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));

            expect(await characterService.getRoster()).toBeNull();
        });
    });

    describe('Verknüpfungen (Redis)', () => {
        beforeEach(() => Object.values(redis).forEach(fn => fn.mockReset()));

        it('speichert Name + fügt den User zur Liste hinzu', async () => {
            await characterService.linkCharacter('u1', 'Acaine');

            expect(redis.set).toHaveBeenCalledWith('CHARACTER:LINK:u1', 'Acaine');
            expect(redis.addToList).toHaveBeenCalledWith('CHARACTER:ALL_LINKS', 'u1');
        });

        it('unlinkCharacter entfernt nur bei bestehender Verknüpfung', async () => {
            redis.get.mockResolvedValueOnce('Acaine');
            expect(await characterService.unlinkCharacter('u1')).toBe(true);
            expect(redis.delete).toHaveBeenCalledWith('CHARACTER:LINK:u1');

            redis.get.mockResolvedValueOnce(null);
            expect(await characterService.unlinkCharacter('u2')).toBe(false);
        });

        it('getAllLinks liefert Name ↔ Discord-User für den späteren Abgleich', async () => {
            redis.getList.mockResolvedValue(['u1', 'u2']);
            redis.get.mockResolvedValueOnce('Acaine').mockResolvedValueOnce('Abraxar');

            expect(await characterService.getAllLinks()).toEqual([
                { discordUserId: 'u1', name: 'Acaine' },
                { discordUserId: 'u2', name: 'Abraxar' },
            ]);
        });
    });
});
