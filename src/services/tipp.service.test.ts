import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        getTimeToLive: vi.fn(),
        setWithExpiry: vi.fn(),
        addToSet: vi.fn(),
        getSetMembers: vi.fn(),
    },
    // Braucht pingPong.service beim Import - der hängt über commands/index.js mit drin.
    REDIS_KEYS: {PING_PONG: 'PING_PONG'}
}));

// Nötig für den abgeleiteten Test unten: commands/index.js zieht sämtliche Handler hoch, ohne
// diesen Mock greift die dokumentierte Zirkular-Import-Falle (siehe hilfe.handler.test.ts).
vi.mock('../client.js', () => ({
    default: {commands: new Map(), on: vi.fn(), once: vi.fn(), channels: {fetch: vi.fn()}, guilds: {cache: new Map()}}
}));

import redisService from './redis.service.js';
import commands, {NUR_ADMIN_BEFEHLE as NUR_ADMIN} from '../commands/index.js';
import tippService, {
    TIPPS,
    NETTIGKEITEN,
    randomTipp,
    randomNettigkeit,
    kommtTippInFrage
} from './tipp.service.js';

const TIPP_TEXTE = TIPPS.map((tipp) => tipp.text);
const ALLE_TIPP_BEFEHLE = [...new Set(TIPPS.map((tipp) => tipp.befehl))];

describe('tipp.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        // Standard: kein aktiver Cooldown (Redis liefert -2, wenn der Key nicht existiert)
        // und noch keine benutzten Befehle.
        vi.mocked(redisService.getTimeToLive).mockResolvedValue(-2);
        vi.mocked(redisService.getSetMembers).mockResolvedValue([]);
    });

    describe('kommtTippInFrage', () => {
        it('sagt nein bei ephemeren Antworten (Fehler, Cooldown-Abfuhr, Admin-Quittung)', () => {
            expect(kommtTippInFrage('sport', true)).toBe(false);
        });

        it('sagt nein bei den Hilfe-Befehlen selbst', () => {
            expect(kommtTippInFrage('hilfe', false)).toBe(false);
            expect(kommtTippInFrage('spielwelt', false)).toBe(false);
        });

        it('sagt ja bei einer normalen öffentlichen Antwort', () => {
            expect(kommtTippInFrage('sport', false)).toBe(true);
            expect(kommtTippInFrage('online', false)).toBe(true);
        });
    });

    describe('merkeBenutztenBefehl', () => {
        it('legt den Befehl im Set der Person ab', async () => {
            await tippService.merkeBenutztenBefehl('user-1', 'sport');

            expect(redisService.addToSet).toHaveBeenCalledWith('TIPP:USED_COMMANDS:user-1', 'sport');
        });
    });

    describe('holeZeileFuerUser', () => {
        it('liefert nichts, wenn der Würfel dagegen ist', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9); // >= CHANCE

            expect(await tippService.holeZeileFuerUser('user-1')).toBeNull();
            expect(redisService.getTimeToLive).not.toHaveBeenCalled();
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });

        it('liefert nichts, wenn die Person heute schon eine Zeile bekommen hat', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.05); // < CHANCE
            vi.mocked(redisService.getTimeToLive).mockResolvedValue(3600);

            expect(await tippService.holeZeileFuerUser('user-1')).toBeNull();
            expect(redisService.setWithExpiry).not.toHaveBeenCalled();
        });

        it('liefert einen Tipp und setzt den Tages-Cooldown', async () => {
            // 1. Wurf: unter CHANCE (Zeile kommt), 2. Wurf: über NETTIGKEIT_CHANCE (also ein Tipp),
            // 3. Wurf: Index in der Tipp-Liste.
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.05)
                .mockReturnValueOnce(0.9)
                .mockReturnValueOnce(0);

            const zeile = await tippService.holeZeileFuerUser('user-1');

            expect(TIPP_TEXTE).toContain(zeile);
            expect(redisService.setWithExpiry).toHaveBeenCalledWith('TIPP:COOLDOWN:user-1', '1', 86400);
        });

        it('liefert manchmal eine Nettigkeit statt eines Tipps', async () => {
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.05)
                .mockReturnValueOnce(0.1) // < NETTIGKEIT_CHANCE
                .mockReturnValueOnce(0);

            expect(NETTIGKEITEN).toContain(await tippService.holeZeileFuerUser('user-1'));
        });

        it('überspringt Tipps zu Befehlen, die die Person schon benutzt hat', async () => {
            // Alle Befehle außer /blahaj sind bekannt - der Tipp muss /blahaj erklären.
            vi.mocked(redisService.getSetMembers).mockResolvedValue(
                ALLE_TIPP_BEFEHLE.filter((befehl) => befehl !== 'blahaj')
            );
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.05)
                .mockReturnValueOnce(0.9)
                .mockReturnValueOnce(0);

            const zeile = await tippService.holeZeileFuerUser('user-1');

            expect(zeile).toContain('/blahaj');
        });

        it('liefert eine Nettigkeit, wenn die Person schon alle Tipp-Befehle kennt', async () => {
            vi.mocked(redisService.getSetMembers).mockResolvedValue(ALLE_TIPP_BEFEHLE);
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.05)
                .mockReturnValueOnce(0.9)
                .mockReturnValueOnce(0);

            expect(NETTIGKEITEN).toContain(await tippService.holeZeileFuerUser('user-1'));
        });
    });

    describe('Zeilen-Auswahl', () => {
        it('randomTipp liefert immer eine Zeile aus TIPPS', () => {
            for (let i = 0; i < 50; i++) {
                expect(TIPP_TEXTE).toContain(randomTipp());
            }
        });

        it('randomTipp lässt benutzte Befehle aus', () => {
            const benutzt = ALLE_TIPP_BEFEHLE.filter((befehl) => befehl !== 'sport');
            for (let i = 0; i < 50; i++) {
                expect(randomTipp(benutzt)).toContain('/sport');
            }
        });

        it('randomTipp liefert null, wenn alle Befehle bekannt sind', () => {
            expect(randomTipp(ALLE_TIPP_BEFEHLE)).toBeNull();
        });

        it('randomNettigkeit liefert immer eine Zeile aus NETTIGKEITEN', () => {
            for (let i = 0; i < 50; i++) {
                expect(NETTIGKEITEN).toContain(randomNettigkeit());
            }
        });

        it('alle Zeilen bleiben deutlich unter dem Discord-Limit', () => {
            for (const zeile of [...TIPP_TEXTE, ...NETTIGKEITEN]) {
                expect(zeile.length).toBeLessThanOrEqual(2000);
            }
        });

        // Doppelte Zeilen fallen beim Pflegen langer Listen leicht durch - und ausgerechnet
        // eine doppelte Nettigkeit würde man als Nutzer sofort merken.
        it('enthält keine doppelten Zeilen', () => {
            expect(new Set(TIPP_TEXTE).size).toBe(TIPP_TEXTE.length);
            expect(new Set(NETTIGKEITEN).size).toBe(NETTIGKEITEN.length);
        });

        // Der befehl-Eintrag muss zum Text passen, sonst filtert der "schon benutzt"-Abgleich
        // an der falschen Stelle - der Text erwähnt den Befehl immer als `/name`.
        it('jeder Tipp nennt seinen eigenen Befehl im Text', () => {
            for (const tipp of TIPPS) {
                expect(tipp.text).toContain(`/${tipp.befehl}`);
            }
        });

        it('hat genug Nettigkeiten, dass sich so schnell nichts wiederholt', () => {
            expect(NETTIGKEITEN.length).toBeGreaterThanOrEqual(100);
        });
    });
});

const alleBefehle = (): string[] => (commands as {data: {name: string}}[]).map((c) => c.data.name);

const beworbeneBefehle = (): string[] => alleBefehle().filter((name) => !NUR_ADMIN.includes(name));

// Abgeleitet aus der Command-Registrierung statt gepflegt - dieselbe Begründung wie beim
// HELP_TEXT-Test: eine handgepflegte Liste bliebe grün, wenn jemand einen Befehl hinzufügt und
// die Tipps vergisst, also genau in dem Fall, den der Test abfangen soll. Genau das ist zwischen
// dem 26. und 31.07.2026 viermal passiert (/rollenspiel, /anstupser, /geburtstag, /beobachten).
// Der Fehler ist hier besonders leise: randomTipp bewirbt nur die noch UNBENUTZTEN Befehle - ein
// Befehl ohne Tipp wird also ausgerechnet von der Funktion nie genannt, die ihn auffindbar
// machen soll, und niemand vermisst eine Zeile, die es nie gab.
describe('TIPPS decken den Befehlsbestand ab', () => {
    it.each(beworbeneBefehle())('hat einen Tipp für /%s', (name) => {
        expect(ALLE_TIPP_BEFEHLE).toContain(name);
    });

    // Gegenprobe zur Ableitung: findet der Test überhaupt Befehle? Ohne das würde eine kaputte
    // Ableitung (leeres Array) als "alles grün" durchgehen - it.each([]) läuft nie.
    it('findet überhaupt Befehle zum Prüfen', () => {
        expect(beworbeneBefehle().length).toBeGreaterThanOrEqual(15);
    });

    // Gegenrichtung: ein Tipp zu einem Befehl, den es nicht mehr gibt, würde für etwas werben,
    // das beim Aufruf als "unbekannter Befehl" endet - und der "schon benutzt"-Filter könnte ihn
    // nie ausblenden, weil der Name nie im Set landet.
    it.each(ALLE_TIPP_BEFEHLE)('bewirbt mit /%s keinen Befehl, den es nicht mehr gibt', (name) => {
        expect(alleBefehle()).toContain(name);
    });

    // Admin-Befehle bleiben bewusst draußen - hier festgehalten, damit die Ausnahme eine
    // Entscheidung bleibt und nicht als Lücke durchgeht.
    it.each(NUR_ADMIN)('lässt den Admin-Befehl /%s bewusst ohne Tipp', (name) => {
        expect(ALLE_TIPP_BEFEHLE).not.toContain(name);
    });
});
