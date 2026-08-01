import {describe, it, expect, vi, beforeEach} from 'vitest';

const drachen = vi.hoisted(() => ({
    getLevels: vi.fn(async () => ({} as Record<string, string>)),
    setLevel: vi.fn(),
    deleteLevel: vi.fn(),
    istGemeldet: vi.fn(async () => false),
    merkeGemeldet: vi.fn(),
    getChannel: vi.fn(async () => 'kanal-1' as string | null),
}));
vi.mock('../services/drachen.service.js', () => ({default: drachen}));

// Nur den Service-Default mocken - die Match-Logik (findLinkForName/passtAufKernNamen) soll
// echt laufen, sie trägt hier die Zuordnung Anzeigename → Verknüpfung.
const characterSvc = vi.hoisted(() => ({getAllLinks: vi.fn()}));
vi.mock('../services/character.service.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/character.service.js')>();
    return {...actual, default: characterSvc};
});

const channelsFetch = vi.hoisted(() => vi.fn());
vi.mock('../client.js', () => ({default: {channels: {fetch: channelsFetch}}}));

import drachenHandler, {
    DRACHEN_FLAVORS,
    MIN_ALTES_LEVEL,
    formatGratulation,
    istDrachentoetung,
    parseLevel,
    randomDrachenFlavor,
} from './drachen.handler.js';

const LINK = {discordUserId: 'u1', name: 'Acaine'};

function makeChannel() {
    return {send: vi.fn().mockResolvedValue(undefined)};
}

describe('istDrachentoetung', () => {
    // Nach der Tötung steht der Charakter wieder bei 1 - das ist das Signal.
    it('erkennt den Sturz vom Max-Level auf 1', () => {
        expect(istDrachentoetung(15, 1)).toBe(true);
    });

    // Der Puffer nach unten fängt ab, dass unser letzter gesehener Stand veraltet ist (jemand
    // steigt zwischen zwei Beobachtungen von 12 auf 15 und tötet den Drachen).
    it('erkennt den Sturz auch von einer Stufe unter dem Maximum', () => {
        expect(istDrachentoetung(MIN_ALTES_LEVEL, 1)).toBe(true);
    });

    it('ignoriert einen Rückgang von niedriger Stufe (kein Drachenkill)', () => {
        expect(istDrachentoetung(MIN_ALTES_LEVEL - 1, 1)).toBe(false);
    });

    // Bewusst "genau 1": Level kann durch andere Effekte schwanken, der Drachenkill setzt zurück.
    it('ignoriert einen Rückgang, der nicht auf 1 endet', () => {
        expect(istDrachentoetung(15, 2)).toBe(false);
    });

    it('ignoriert Aufstiege und Stillstand', () => {
        expect(istDrachentoetung(1, 2)).toBe(false);
        expect(istDrachentoetung(15, 15)).toBe(false);
    });
});

describe('parseLevel', () => {
    it('liest die Stufe aus dem Rohstring', () => {
        expect(parseLevel('15')).toBe(15);
        expect(parseLevel(' 3 ')).toBe(3);
    });

    // Kaputtes Markup darf nicht als NaN weiterrechnen - der Charakter wird übersprungen.
    it('liefert null für Unbrauchbares', () => {
        expect(parseLevel('')).toBeNull();
        expect(parseLevel(undefined)).toBeNull();
        expect(parseLevel('keine Stufe')).toBeNull();
    });
});

describe('Gratulations-Text', () => {
    it('nennt Charakter und Discord-User', () => {
        const text = formatGratulation('u1', 'Centurio Acaine');
        expect(text).toContain('**Centurio Acaine**');
        expect(text).toContain('<@u1>');
    });

    it('hängt eine Flavor-Zeile an', () => {
        const text = formatGratulation('u1', 'Acaine');
        expect(DRACHEN_FLAVORS.some(flavor => text.includes(flavor))).toBe(true);
    });

    it('randomDrachenFlavor liefert immer eine Zeile aus der Liste', () => {
        for (let i = 0; i < 20; i++) {
            expect(DRACHEN_FLAVORS).toContain(randomDrachenFlavor());
        }
    });

    it('die Flavor-Liste ist duplikatfrei', () => {
        expect(new Set(DRACHEN_FLAVORS).size).toBe(DRACHEN_FLAVORS.length);
    });
});

// Der gemeinsame Poller fragt das, bevor er lotgd.de abruft.
describe('DrachenHandler.brauchtOnlineStand', () => {
    beforeEach(() => vi.clearAllMocks());

    it('meldet Bedarf nur bei konfiguriertem Kanal', async () => {
        drachen.getChannel.mockResolvedValue('kanal-1');
        expect(await drachenHandler.brauchtOnlineStand()).toBe(true);

        drachen.getChannel.mockResolvedValue(null);
        expect(await drachenHandler.brauchtOnlineStand()).toBe(false);
    });
});

describe('DrachenHandler.pruefeLevel', () => {
    let channel: ReturnType<typeof makeChannel>;

    beforeEach(() => {
        vi.clearAllMocks();
        channel = makeChannel();
        channelsFetch.mockResolvedValue(channel);
        drachen.getChannel.mockResolvedValue('kanal-1');
        drachen.getLevels.mockResolvedValue({});
        drachen.istGemeldet.mockResolvedValue(false);
        characterSvc.getAllLinks.mockResolvedValue([LINK]);
    });

    it('gratuliert beim Sturz auf Stufe 1 und pingt den verknüpften User', async () => {
        drachen.getLevels.mockResolvedValue({Acaine: '15'});

        await drachenHandler.pruefeLevel([{name: 'Centurio Acaine', level: '1'}]);

        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.send.mock.calls[0][0].content).toContain('<@u1>');
        // Der Ping ist hier gewollt, aber als Allowlist auf genau diese Person: im Text steht
        // ein aus der Kriegerliste GESCRAPTER Name, der soll nichts anderes auslösen können.
        expect(channel.send.mock.calls[0][0].allowedMentions).toEqual({users: ['u1']});
    });

    it('schreibt den neuen Stand fort, auch ohne Gratulation', async () => {
        drachen.getLevels.mockResolvedValue({Acaine: '4'});

        await drachenHandler.pruefeLevel([{name: 'Ritter Acaine', level: '5'}]);

        expect(drachen.setLevel).toHaveBeenCalledWith('Acaine', 5);
        expect(channel.send).not.toHaveBeenCalled();
    });

    // Erste Beobachtung: es gibt keinen Vorher-Wert, also wird nur gesetzt (sonst gälte jeder
    // frisch verknüpfte Charakter auf Stufe 1 sofort als Drachentöter).
    it('gratuliert beim ersten Sehen nicht, sondern merkt sich nur die Stufe', async () => {
        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}]);

        expect(drachen.setLevel).toHaveBeenCalledWith('Acaine', 1);
        expect(channel.send).not.toHaveBeenCalled();
    });

    // Gespeichert wird unter dem Kern-Namen: der Titel-Präfix wechselt mit der Stufe, als
    // Schlüssel wäre er bei jedem Aufstieg ein anderer.
    it('speichert unter dem Kern-Namen, nicht unter dem Anzeigenamen mit Titel', async () => {
        await drachenHandler.pruefeLevel([{name: 'Centurio Acaine', level: '7'}]);

        expect(drachen.setLevel).toHaveBeenCalledWith('Acaine', 7);
    });

    it('ignoriert Charaktere ohne Verknüpfung', async () => {
        drachen.getLevels.mockResolvedValue({Fremdling: '15'});

        await drachenHandler.pruefeLevel([{name: 'Fremdling', level: '1'}]);

        expect(drachen.setLevel).not.toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
    });

    // Der Roster ist bis zu 10 min gecacht: ein alter Abruf kann nach der Tötung noch die hohe
    // Stufe liefern, die als "neuer Stand" landet - der nächste frische Abruf sähe denselben
    // Sturz ein zweites Mal.
    it('gratuliert nicht doppelt, solange die Meldesperre steht', async () => {
        drachen.getLevels.mockResolvedValue({Acaine: '15'});
        drachen.istGemeldet.mockResolvedValue(true);

        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}]);

        expect(channel.send).not.toHaveBeenCalled();
        // Der Stand wird trotzdem fortgeschrieben.
        expect(drachen.setLevel).toHaveBeenCalledWith('Acaine', 1);
    });

    it('setzt die Meldesperre nach erfolgreicher Gratulation', async () => {
        drachen.getLevels.mockResolvedValue({Acaine: '15'});

        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}]);

        expect(drachen.merkeGemeldet).toHaveBeenCalledWith('Acaine');
    });

    // Scheitert das Senden, darf die Gratulation beim nächsten Mal nachkommen.
    it('setzt die Meldesperre NICHT, wenn das Senden scheitert', async () => {
        drachen.getLevels.mockResolvedValue({Acaine: '15'});
        channel.send.mockRejectedValue(new Error('keine Rechte'));

        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}]);

        expect(drachen.merkeGemeldet).not.toHaveBeenCalled();
    });

    // Ohne Kanal wird auch NICHT mitgeschrieben - sonst würde ein Sturz still verbraucht und
    // die Feier wäre für immer weg.
    it('tut gar nichts (auch kein Mitschreiben), wenn kein Kanal gesetzt ist', async () => {
        drachen.getChannel.mockResolvedValue(null);

        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}]);

        expect(drachen.setLevel).not.toHaveBeenCalled();
        expect(characterSvc.getAllLinks).not.toHaveBeenCalled();
    });

    it('tut nichts, wenn der Kanal nicht abrufbar ist', async () => {
        channelsFetch.mockResolvedValue(null);

        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}]);

        expect(drachen.setLevel).not.toHaveBeenCalled();
    });

    it('überspringt Einträge mit unlesbarer Stufe', async () => {
        await drachenHandler.pruefeLevel([{name: 'Acaine', level: '—'}]);

        expect(drachen.setLevel).not.toHaveBeenCalled();
    });

    // Eine Gratulation darf den auslösenden Befehl (/online, /charakter anzeigen) nie kosten.
    it('schluckt Fehler, statt sie an den auslösenden Befehl durchzureichen', async () => {
        characterSvc.getAllLinks.mockRejectedValue(new Error('Redis weg'));
        const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(drachenHandler.pruefeLevel([{name: 'Acaine', level: '1'}])).resolves.toBeUndefined();
        expect(fehler).toHaveBeenCalled();

        fehler.mockRestore();
    });
});
