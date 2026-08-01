import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOnline = vi.fn();
vi.mock('../services/online.service.js', () => ({
    default: { getOnline: (...args: unknown[]) => getOnline(...args) },
}));

const getTageswechsel = vi.fn();
vi.mock('../services/spielzeit.service.js', () => ({
    default: { getTageswechsel: (...args: unknown[]) => getTageswechsel(...args) },
}));

// Die Drachen-Prüfung hängt nur nebenher an /online (fire-and-forget) und zieht client hoch.
const drachenHandler = vi.hoisted(() => ({ pruefeLevel: vi.fn() }));
vi.mock('./drachen.handler.js', () => ({ default: drachenHandler }));

// Nur Redis wegmocken - die Match-Logik von character.service soll echt laufen.
vi.mock('../services/redis.service.js', () => ({
    default: { get: vi.fn(), getList: vi.fn() },
}));

import characterService from '../services/character.service.js';
import onlineHandler, {groupByCity} from './online.handler.js';

const getAllLinks = vi.spyOn(characterService, 'getAllLinks');

function makeInteraction() {
    return { deferReply: vi.fn(), editReply: vi.fn() } as any;
}

// Ab dem Verknüpfungs-Abgleich antwortet der Handler mit {content, allowedMentions}.
const content = (interaction: any) => interaction.editReply.mock.calls[0][0].content as string;

describe('OnlineHandler', () => {
    beforeEach(() => {
        getOnline.mockReset();
        getAllLinks.mockReset();
        getAllLinks.mockResolvedValue([]);
        // Standardfall in den Bestandstests: kein Countdown, damit die Erwartungen unverändert gelten.
        getTageswechsel.mockReset();
        getTageswechsel.mockResolvedValue(null);
        drachenHandler.pruefeLevel.mockReset();
        drachenHandler.pruefeLevel.mockResolvedValue(undefined);
    });

    // Opportunistische Drachentötungs-Erkennung: /online hat die Stufen ohnehin geholt, also
    // werden sie gleich mitgeprüft - ohne zusätzlichen Abruf bei lotgd.de.
    it('reicht die geholten Stufen an die Drachentötungs-Prüfung weiter', async () => {
        const players = [
            { gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true },
        ];
        getOnline.mockResolvedValue({ players, recent: [] });

        await onlineHandler.handleOnline(makeInteraction());

        expect(drachenHandler.pruefeLevel).toHaveBeenCalledWith(players);
    });

    it('prüft nichts, wenn die Kriegerliste gar nicht abrufbar war', async () => {
        getOnline.mockResolvedValue(null);

        await onlineHandler.handleOnline(makeInteraction());

        expect(drachenHandler.pruefeLevel).not.toHaveBeenCalled();
    });

    it('formatiert die eingeloggten Spieler mit Stufe und Rasse, gruppiert nach Stadt', async () => {
        getOnline.mockResolvedValue({
            players: [
                { gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true },
                { gilde: '<CdF>', name: 'Danjun', ort: 'Romar', level: '11', rasse: 'Mensch', lebt: true },
            ],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        expect(reply).toContain('Gerade im Wyrmland unterwegs (2):');
        expect(reply).toContain('__Glorfindal__ (1)');
        expect(reply).toContain('Cvetanka — Stufe 14 Echse');
        expect(reply).toContain('__Romar__ (1)');
        expect(reply).toContain('<CdF> Danjun — Stufe 11 Mensch');
        // Der Ort steht nur noch als Überschrift, nicht mehr in jeder Zeile.
        expect(reply).not.toContain(', in Glorfindal');
    });

    it('gruppiert mehrere Spieler derselben Stadt unter eine Überschrift', async () => {
        getOnline.mockResolvedValue({
            players: [
                { gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true },
                { gilde: '', name: 'Danjun', ort: 'Romar', level: '11', rasse: 'Mensch', lebt: true },
                { gilde: '', name: 'Bora', ort: 'Romar', level: '8', rasse: 'Elf', lebt: true },
            ],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        // Romar hat zwei Spieler -> steht als größere Gruppe zuerst und nur einmal als Überschrift.
        expect(reply.match(/__Romar__/g)).toHaveLength(1);
        expect(reply).toContain('__Romar__ (2)');
        expect(reply.indexOf('__Romar__')).toBeLessThan(reply.indexOf('__Glorfindal__'));
    });

    it('markiert tote Charaktere mit (tot)', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Outremer', ort: 'Romar', level: '12', rasse: 'Mensch', lebt: false }],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(content(interaction)).toContain('Outremer — Stufe 12 Mensch (tot)');
    });

    it('hebt verknüpfte Charaktere hervor - auch mit Titel-Präfix im Spielnamen', async () => {
        getAllLinks.mockResolvedValue([{ discordUserId: '42', name: 'Acaine' }]);
        getOnline.mockResolvedValue({
            players: [
                { gilde: '', name: 'Centurio Acaine', ort: 'Romar', level: '9', rasse: 'Elf', lebt: true },
                { gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true },
            ],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        expect(reply).toContain('**Centurio Acaine** (<@42>) — Stufe 9 Elf');
        expect(reply).toContain('Cvetanka — Stufe 14');
        // Niemand soll von einem /online angepingt werden.
        expect(interaction.editReply.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
    });

    it('hebt verknüpfte Charaktere auch in der 30-Minuten-Zeile hervor', async () => {
        getAllLinks.mockResolvedValue([{ discordUserId: '42', name: 'Xara' }]);
        getOnline.mockResolvedValue({ players: [], recent: ['Xara'] });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(content(interaction)).toContain('**Xara** (<@42>)');
    });

    it('zeigt die Liste auch dann, wenn die Verknüpfungen nicht ladbar sind', async () => {
        getAllLinks.mockRejectedValue(new Error('Redis weg'));
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true }],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(content(interaction)).toContain('Cvetanka — Stufe 14 Echse');
    });

    it('hängt 30-Minuten-Namen an, aber nur die nicht ohnehin Eingeloggten', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true }],
            recent: ['Cvetanka', 'Xara'],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        expect(reply).toContain('Auch in den letzten 30 Minuten aktiv:');
        expect(reply).toContain('Xara');
        // Cvetanka steht schon oben als eingeloggt - nicht doppelt in der 30-Min-Zeile.
        expect(reply.match(/Cvetanka/g)).toHaveLength(1);
    });

    it('meldet, wenn niemand eingeloggt ist', async () => {
        getOnline.mockResolvedValue({ players: [], recent: [] });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith('Gerade ist niemand im Wyrmland eingeloggt.');
    });

    it('hängt den Tageswechsel als Discord-Timestamp an', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Romar', level: '14', rasse: 'Echse', lebt: true }],
            recent: [],
        });
        getTageswechsel.mockResolvedValue(1_753_980_327_000);
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(content(interaction)).toContain('_Der neue Tag bricht <t:1753980327:R> an._');
    });

    it('nennt den Tageswechsel auch, wenn niemand eingeloggt ist', async () => {
        getOnline.mockResolvedValue({ players: [], recent: [] });
        getTageswechsel.mockResolvedValue(1_753_980_327_000);
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(interaction.editReply.mock.calls[0][0]).toContain('<t:1753980327:R>');
    });

    // Der Countdown ist ein Bonus: ein kaputter about.php-Abruf darf die Liste nicht kosten.
    it('lässt die Zeile weg, wenn der Tageswechsel nicht abrufbar ist', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Romar', level: '14', rasse: 'Echse', lebt: true }],
            recent: [],
        });
        getTageswechsel.mockResolvedValue(null);
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        expect(reply).toContain('Cvetanka');
        expect(reply).not.toContain('neue Tag');
    });

    // Platz für den Countdown wird vorab reserviert - sonst fällt er an vollen Tagen als Erstes weg.
    it('behält den Countdown, wenn die Liste ans Zeichenlimit stößt', async () => {
        getOnline.mockResolvedValue({
            players: Array.from({length: 200}, (_, i) => ({
                gilde: '', name: `Spieler${i}`, ort: 'Romar', level: '14', rasse: 'Echse', lebt: true,
            })),
            recent: [],
        });
        getTageswechsel.mockResolvedValue(1_753_980_327_000);
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        expect(reply).toContain('<t:1753980327:R>');
        expect(reply.length).toBeLessThanOrEqual(2000);
    });

    it('meldet einen Abruf-Fehler, statt zu crashen', async () => {
        getOnline.mockResolvedValue(null);
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(
            'Konnte die Kriegerliste gerade nicht abrufen. Versuch es später nochmal.'
        );
    });
});

describe('groupByCity', () => {
    const p = (name: string, ort: string) =>
        ({ gilde: '', name, ort, level: '1', rasse: 'Mensch', lebt: true });

    it('sortiert größere Gruppen nach vorne, bei Gleichstand alphabetisch', () => {
        const gruppen = groupByCity([
            p('A', 'Zwergenhort'),
            p('B', 'Romar'),
            p('C', 'Romar'),
            p('D', 'Aravir'),
        ]);
        expect(gruppen.map(g => g.ort)).toEqual(['Romar', 'Aravir', 'Zwergenhort']);
        expect(gruppen[0].spieler).toHaveLength(2);
    });

    it('fängt eine leere Ort-Angabe als "Unbekannt" auf', () => {
        const gruppen = groupByCity([p('A', '')]);
        expect(gruppen[0].ort).toBe('Unbekannt');
    });
});
