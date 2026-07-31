import {describe, it, expect, vi, beforeEach} from 'vitest';
import {MessageFlags} from 'discord.js';

const service = vi.hoisted(() => ({
    fuegeHinzu: vi.fn(),
    entferne: vi.fn(),
    holeListe: vi.fn(),
    holeBeobachter: vi.fn(),
    holeZuletztOnline: vi.fn(),
    setzeZuletztOnline: vi.fn(),
    istGesperrt: vi.fn(),
    sperre: vi.fn(),
}));
vi.mock('../services/beobachten.service.js', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    default: service,
}));

const getOnline = vi.hoisted(() => vi.fn());
vi.mock('../services/online.service.js', () => ({default: {getOnline}}));

const getRoster = vi.hoisted(() => vi.fn());
vi.mock('../services/character.service.js', async (original) => ({
    ...(await original<Record<string, unknown>>()),
    default: {getRoster},
}));

const sendeDm = vi.hoisted(() => vi.fn());
vi.mock('../services/dm.service.js', () => ({sendeDm, DM_GESCHLOSSEN: 50007}));

import beobachtenHandler, {BEOBACHTEN_HILFE, formatMeldung, POLL_INTERVALL_MS} from './beobachten.handler.js';
import {MAX_NAMEN} from '../services/beobachten.service.js';

const spieler = (name: string, ort = 'Romar') =>
    ({gilde: '', name, ort, level: '12', rasse: 'Mensch', lebt: true});

const mockInteraction = (name?: string, userId = 'u1') => ({
    user: {id: userId},
    options: {getString: vi.fn().mockReturnValue(name)},
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
} as any);

// Der Poller taktet sich selbst herunter - für aufeinanderfolgende Durchläufe die Uhr weiterdrehen.
async function pollen() {
    vi.setSystemTime(Date.now() + POLL_INTERVALL_MS + 1000);
    await beobachtenHandler.pruefeBeobachtungen();
}

describe('BeobachtenHandler', () => {
    // Der Handler merkt sich den letzten Abruf im Speicher und überlebt als Singleton die
    // einzelnen Tests - die Testuhr muss deshalb monoton weiterlaufen, sonst läge der
    // gemerkte Zeitpunkt in der Zukunft und jeder Poll stiege sofort wieder aus.
    let basis = new Date('2026-07-31T12:00:00').getTime();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        basis += 60 * 60 * 1000;
        vi.setSystemTime(basis);
        service.holeListe.mockResolvedValue([]);
        service.holeBeobachter.mockResolvedValue([]);
        service.holeZuletztOnline.mockResolvedValue([]);
        service.istGesperrt.mockResolvedValue(false);
        sendeDm.mockResolvedValue(true);
        getRoster.mockResolvedValue([{name: 'Centurio Acaine', gilde: '', ort: 'Romar', level: '12', rasse: 'Mensch', lebt: true}]);
        getOnline.mockResolvedValue({players: [], recent: []});
    });

    describe('handleHinzufuegen', () => {
        it('prüft den Namen gegen das Roster und speichert ihn', async () => {
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(service.fuegeHinzu).toHaveBeenCalledWith('u1', 'Acaine');
            expect(interaction.editReply.mock.calls[0][0]).toContain('Centurio Acaine');
        });

        // Ohne die Prüfung bliebe ein Tippfehler für immer unauffällig - die Meldung käme nie.
        it('lehnt einen Namen ab, den es im Roster nicht gibt', async () => {
            const interaction = mockInteraction('Acainee');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(service.fuegeHinzu).not.toHaveBeenCalled();
            expect(interaction.editReply.mock.calls[0][0]).toContain('finde ich nicht');
        });

        it('meldet einen kaputten Roster-Abruf, statt den Namen ungeprüft zu speichern', async () => {
            getRoster.mockResolvedValue(null);
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(service.fuegeHinzu).not.toHaveBeenCalled();
            expect(interaction.editReply.mock.calls[0][0]).toContain('später nochmal');
        });

        // Anstupser-Muster: kommt die Test-DM nicht an, wird gar nicht erst etwas eingetragen.
        it('speichert nichts, wenn die Test-DM beim ersten Namen scheitert', async () => {
            sendeDm.mockResolvedValue(false);
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(service.fuegeHinzu).not.toHaveBeenCalled();
            expect(interaction.editReply.mock.calls[0][0]).toContain('keine DM schicken');
        });

        // Nur beim ERSTEN Namen - danach ist bewiesen, dass die DMs offen sind.
        it('schickt keine Test-DM, wenn schon Namen auf der Liste stehen', async () => {
            service.holeListe.mockResolvedValue(['Bora']);

            await beobachtenHandler.handleHinzufuegen(mockInteraction('Acaine'));

            expect(sendeDm).not.toHaveBeenCalled();
            expect(service.fuegeHinzu).toHaveBeenCalled();
        });

        it('lehnt einen Namen ab, der schon auf der Liste steht', async () => {
            service.holeListe.mockResolvedValue(['acaine']);
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(service.fuegeHinzu).not.toHaveBeenCalled();
            expect(interaction.reply.mock.calls[0][0].content).toContain('steht schon');
        });

        it('lehnt ab, wenn die Liste voll ist', async () => {
            service.holeListe.mockResolvedValue(Array.from({length: MAX_NAMEN}, (_, i) => `Name${i}`));
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(service.fuegeHinzu).not.toHaveBeenCalled();
            expect(interaction.reply.mock.calls[0][0].content).toContain('voll');
        });

        it('antwortet ephemer - wen jemand beobachtet, geht niemanden sonst etwas an', async () => {
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleHinzufuegen(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({flags: MessageFlags.Ephemeral});
        });
    });

    describe('handleEntfernen', () => {
        it('nimmt den gespeicherten Namen herunter, auch bei anderer Schreibweise', async () => {
            service.holeListe.mockResolvedValue(['Acaine']);
            const interaction = mockInteraction('acaine');

            await beobachtenHandler.handleEntfernen(interaction);

            // Wichtig: mit der GESPEICHERTEN Schreibweise, sonst löscht das Redis-Set nichts.
            expect(service.entferne).toHaveBeenCalledWith('u1', 'Acaine');
        });

        it('meldet, wenn der Name gar nicht auf der Liste steht', async () => {
            service.holeListe.mockResolvedValue([]);
            const interaction = mockInteraction('Acaine');

            await beobachtenHandler.handleEntfernen(interaction);

            expect(service.entferne).not.toHaveBeenCalled();
            expect(interaction.reply.mock.calls[0][0].content).toContain('steht nicht');
        });
    });

    describe('handleListe', () => {
        it('zeigt die eigene Liste ephemer', async () => {
            service.holeListe.mockResolvedValue(['Bora', 'Acaine']);
            const interaction = mockInteraction();

            await beobachtenHandler.handleListe(interaction);

            const antwort = interaction.reply.mock.calls[0][0];
            expect(antwort.flags).toBe(MessageFlags.Ephemeral);
            expect(antwort.content).toContain('Acaine');
            expect(antwort.content.indexOf('Acaine')).toBeLessThan(antwort.content.indexOf('Bora'));
        });

        it('meldet eine leere Liste', async () => {
            const interaction = mockInteraction();

            await beobachtenHandler.handleListe(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain('niemanden');
        });
    });

    describe('pruefeBeobachtungen', () => {
        it('ruft gar nichts ab, solange niemand jemanden beobachtet', async () => {
            await pollen();

            expect(getOnline).not.toHaveBeenCalled();
        });

        it('meldet einen beobachteten Charakter, der neu online ist', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            service.holeListe.mockResolvedValue(['Acaine']);
            getOnline.mockResolvedValue({players: [spieler('Centurio Acaine')], recent: []});

            await pollen();

            expect(sendeDm).toHaveBeenCalledWith('u1', expect.stringContaining('Centurio Acaine'), 'Beobachtung');
            expect(service.setzeZuletztOnline).toHaveBeenCalledWith(['acaine']);
        });

        // Der Titel-Präfix wechselt mit dem Level - verglichen wird deshalb der Kern-Name.
        it('erkennt den Charakter trotz Titel-Präfix', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            service.holeListe.mockResolvedValue(['Acaine']);
            getOnline.mockResolvedValue({players: [spieler('Bauernmädchen Acaine')], recent: []});

            await pollen();

            expect(sendeDm).toHaveBeenCalled();
        });

        it('meldet nicht erneut, wenn der Charakter beim letzten Mal schon online war', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            service.holeListe.mockResolvedValue(['Acaine']);
            service.holeZuletztOnline.mockResolvedValue(['acaine']);
            getOnline.mockResolvedValue({players: [spieler('Centurio Acaine')], recent: []});

            await pollen();

            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('meldet niemanden, der gar nicht beobachtet wird', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            service.holeListe.mockResolvedValue(['Bora']);
            getOnline.mockResolvedValue({players: [spieler('Centurio Acaine')], recent: []});

            await pollen();

            expect(sendeDm).not.toHaveBeenCalled();
            expect(service.setzeZuletztOnline).toHaveBeenCalledWith([]);
        });

        it('respektiert die Meldesperre', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            service.holeListe.mockResolvedValue(['Acaine']);
            service.istGesperrt.mockResolvedValue(true);
            getOnline.mockResolvedValue({players: [spieler('Centurio Acaine')], recent: []});

            await pollen();

            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('setzt die Sperre nur, wenn die DM auch ankam', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            service.holeListe.mockResolvedValue(['Acaine']);
            sendeDm.mockResolvedValue(false);
            getOnline.mockResolvedValue({players: [spieler('Centurio Acaine')], recent: []});

            await pollen();

            expect(service.sperre).not.toHaveBeenCalled();
        });

        it('benachrichtigt mehrere Beobachter desselben Charakters', async () => {
            service.holeBeobachter.mockResolvedValue(['u1', 'u2']);
            service.holeListe.mockResolvedValue(['Acaine']);
            getOnline.mockResolvedValue({players: [spieler('Centurio Acaine')], recent: []});

            await pollen();

            expect(sendeDm).toHaveBeenCalledTimes(2);
            expect(service.setzeZuletztOnline).toHaveBeenCalledWith(['acaine']);
        });

        // Sonst gälte beim nächsten Durchlauf jeder Eingeloggte als frisch online.
        it('lässt den Übergangs-State unangetastet, wenn der Abruf scheitert', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);
            getOnline.mockResolvedValue(null);

            await pollen();

            expect(service.setzeZuletztOnline).not.toHaveBeenCalled();
            expect(sendeDm).not.toHaveBeenCalled();
        });

        it('ruft lotgd.de nur im eingestellten Takt ab, nicht bei jedem Timer-Schlag', async () => {
            service.holeBeobachter.mockResolvedValue(['u1']);

            await pollen();
            await beobachtenHandler.pruefeBeobachtungen(); // gleich danach nochmal
            vi.setSystemTime(Date.now() + 60 * 1000);
            await beobachtenHandler.pruefeBeobachtungen(); // eine Minute später

            expect(getOnline).toHaveBeenCalledTimes(1);
        });

        it('läuft nicht in einen Fehler, wenn Redis wegbricht', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            service.holeBeobachter.mockRejectedValue(new Error('Redis weg'));

            await expect(pollen()).resolves.toBeUndefined();
        });
    });

    describe('formatMeldung', () => {
        it('nennt Namen und Ort', () => {
            expect(formatMeldung('Centurio Acaine', 'Romar')).toContain('**Centurio Acaine**');
            expect(formatMeldung('Centurio Acaine', 'Romar')).toContain('Romar');
        });

        it('kommt ohne Ort aus', () => {
            expect(formatMeldung('Acaine', '')).not.toContain('–');
        });
    });

    it('nennt in der Hilfe alle eigenen Subcommands', () => {
        for (const sub of ['hinzufuegen', 'entfernen', 'liste', 'hilfe']) {
            expect(BEOBACHTEN_HILFE).toContain(`/beobachten ${sub}`);
        }
    });
});
