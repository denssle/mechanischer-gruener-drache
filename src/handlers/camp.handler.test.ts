import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../services/camp.service.js', () => ({
    default: {
        pruefeCampFortschrittSeitStart: vi.fn(),
        getCampFortschrittSeitStart: vi.fn(),
        getCampStartDate: vi.fn(),
        initialisiereCamp: vi.fn(),
        setCurrentLevel: vi.fn(),
        getCurrentLevel: vi.fn(),
    },
}));

vi.mock('../services/ankuendigungskanal.service.js', () => ({
    default: {
        holeAnkuendigungskanal: vi.fn(),
    },
}));

import campService from '../services/camp.service.js';
import campHandler from './camp.handler.js';
import ankuendigungskanalService from '../services/ankuendigungskanal.service.js';

describe('CampHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(campService.getCurrentLevel)
            .mockResolvedValue(0);
    });

    it('zeigt die aktuellen und insgesamt gesammelten Camp-Ressourcen an', async () => {
        vi.mocked(campService.getCampFortschrittSeitStart)
            .mockResolvedValue({
                aktuell: {
                    baumaterial: 7.5,
                    vorraete: 15,
                },
                insgesamt: {
                    baumaterial: 22.5,
                    vorraete: 95,
                },
                aktuelleStufe: {
                    phase: 1,
                    name: 'Bewohnbares Lager',
                },
                naechsteStufe: {
                    phase: 1,
                    stufe: 2,
                    name: 'Feuerstelle & Vorratsplatz',
                    kosten: {
                        baumaterial: 20,
                        vorraete: 85,
                    },
                    ausbau: [
                        'Feuerstelle repariert',
                        'einfacher Kochplatz',
                        'erste gesammelte Vorräte',
                    ],
                },
            });

        const reply = vi.fn();

        const interaction = {
            reply,
        } as any;

        await campHandler.handleRessourcen(interaction);

        expect(campService.getCampFortschrittSeitStart)
            .toHaveBeenCalledOnce();

        expect(reply).toHaveBeenCalledOnce();

        const antwort = reply.mock.calls[0][0];

        expect(antwort).toContain('7.5/20 BM');
        expect(antwort).toContain('15/85 Vorräte');
        expect(antwort).toContain('22.5 BM');
        expect(antwort).toContain('95 Vorräte');
        expect(antwort).toContain('Feuerstelle & Vorratsplatz');
        expect(antwort).toContain('Phase 1 – Bewohnbares Lager');
    });

    it('rundet Camp-Ressourcen in der Anzeige auf eine Nachkommastelle', async () => {
        vi.mocked(campService.getCampFortschrittSeitStart)
            .mockResolvedValue({
                aktuell: {
                    baumaterial: 1.2200000000000024,
                    vorraete: 15.000000000000002,
                },
                insgesamt: {
                    baumaterial: 16.220000000000002,
                    vorraete: 95.00000000000001,
                },
                aktuelleStufe: {
                    phase: 1,
                    name: 'Bewohnbares Lager',
                },
                naechsteStufe: {
                    phase: 1,
                    stufe: 2,
                    name: 'Feuerstelle & Vorratsplatz',
                    kosten: {
                        baumaterial: 20,
                        vorraete: 85,
                    },
                    ausbau: [
                        'Feuerstelle repariert',
                        'einfacher Kochplatz',
                        'erste gesammelte Vorräte',
                    ],
                },
            });

        const reply = vi.fn();

        await campHandler.handleRessourcen({reply} as any);

        const antwort = reply.mock.calls[0][0];

        expect(antwort).toContain('1.2/20 BM');
        expect(antwort).toContain('15/85 Vorräte');
        expect(antwort).toContain('16.2 BM');
        expect(antwort).toContain('95 Vorräte');

        expect(antwort).not.toContain('1.2200000000000024');
        expect(antwort).not.toContain('16.220000000000002');
    });

    it('zeigt verfügbare Camp-Ressourcen niemals negativ an', async () => {
        vi.mocked(campService.getCampFortschrittSeitStart)
            .mockResolvedValue({
                aktuell: {
                    baumaterial: -13.25,
                    vorraete: -20,
                },
                insgesamt: {
                    baumaterial: 1.75,
                    vorraete: 60,
                },
                aktuelleStufe: {
                    phase: 1,
                    name: 'Bewohnbares Lager',
                },
                naechsteStufe: {
                    phase: 1,
                    stufe: 2,
                    name: 'Feuerstelle & Vorratsplatz',
                    kosten: {
                        baumaterial: 20,
                        vorraete: 85,
                    },
                    ausbau: [
                        'Feuerstelle repariert',
                        'einfacher Kochplatz',
                        'erste gesammelte Vorräte',
                    ],
                },
            });

        const reply = vi.fn();

        await campHandler.handleRessourcen({reply} as any);

        const antwort = reply.mock.calls[0][0];

        expect(antwort).toContain('0/20 BM');
        expect(antwort).toContain('0/85 Vorräte');
        expect(antwort).not.toContain('-13.25');
        expect(antwort).not.toContain('-20');
    });

    it('prüft den Camp-Fortschritt seit dem Staffelstart', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([]);

        await campHandler.pruefeFortschritt();

        expect(campService.pruefeCampFortschrittSeitStart)
            .toHaveBeenCalledOnce();
    });

    it('zählt das Camp-Level über Phasengrenzen hinweg weiter', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 2,
                    stufe: 1,
                    name: 'Erste Stufe der zweiten Phase',
                    kosten: {
                        baumaterial: 25,
                        vorraete: 90,
                    },
                    ausbau: [
                        'Feuerstelle repariert',
                        'einfacher Kochplatz',
                        'erste gesammelte Vorräte',
                    ],
                },
            ]);

        vi.mocked(campService.getCurrentLevel)
            .mockResolvedValue(2);

        const send = vi.fn();

        vi.mocked(ankuendigungskanalService.holeAnkuendigungskanal)
            .mockResolvedValue({send} as any);

        await campHandler.pruefeFortschritt();

        expect(campService.setCurrentLevel)
            .toHaveBeenCalledWith(3);
    });

    it('meldet, wenn das Camp noch nicht gestartet wurde', async () => {
        vi.mocked(campService.getCampFortschrittSeitStart)
            .mockResolvedValue(null);

        const reply = vi.fn();

        const interaction = {
            reply,
        } as any;

        await campHandler.handleRessourcen(interaction);

        expect(reply).toHaveBeenCalledWith(
            'Das Camp wurde noch nicht gestartet.'
        );
    });

    it('lehnt das Starten ohne Administrator-Rechte ab', async () => {
        const reply = vi.fn();

        const interaction = {
            memberPermissions: {
                has: vi.fn().mockReturnValue(false),
            },
            reply,
        } as any;

        await campHandler.handleStarten(interaction);

        expect(reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
            })
        );

        expect(campService.initialisiereCamp).not.toHaveBeenCalled();
    });

    it('startet das Camp als Administrator', async () => {
        const reply = vi.fn();

        vi.mocked(campService.getCampStartDate)
            .mockResolvedValue(null);

        const interaction = {
            memberPermissions: {
                has: vi.fn().mockReturnValue(true),
            },
            reply,
        } as any;

        await campHandler.handleStarten(interaction);

        expect(campService.initialisiereCamp)
            .toHaveBeenCalledWith(expect.any(Date));

        expect(reply).toHaveBeenCalledOnce();
    });

    it('überschreibt den vorhandenen Camp-Start nicht', async () => {
        const reply = vi.fn();

        vi.mocked(campService.getCampStartDate)
            .mockResolvedValue(new Date('2026-09-19T00:00:00.000Z'));

        const interaction = {
            memberPermissions: {
                has: vi.fn().mockReturnValue(true),
            },
            reply,
        } as any;

        await campHandler.handleStarten(interaction);

        expect(campService.initialisiereCamp)
            .not.toHaveBeenCalled();

        expect(reply).toHaveBeenCalledOnce();
    });

    it('zeigt die Hilfe für die Camp-Befehle an', async () => {
        const reply = vi.fn();

        const interaction = {
            reply,
        } as any;

        await campHandler.handleHilfe(interaction);

        expect(reply).toHaveBeenCalledOnce();

        const antwort = reply.mock.calls[0][0];

        expect(antwort).toContain('/camp ressourcen');
        expect(antwort).toContain('/camp hilfe');
    });

    it('ruft keinen Ankündigungskanal ab, wenn keine neue Camp-Stufe erreicht wurde', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([]);

        await campHandler.pruefeFortschritt();

        expect(ankuendigungskanalService.holeAnkuendigungskanal)
            .not.toHaveBeenCalled();
    });

    it('kündigt eine neu erreichte Camp-Stufe im Sportkanal an', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                    ausbau: [
                        'einfache, bequeme Schlafplätze',
                        'trockene Lagerstelle für Holz und Stein',
                    ],
                },
            ]);

        const send = vi.fn();

        vi.mocked(ankuendigungskanalService.holeAnkuendigungskanal)
            .mockResolvedValue({send} as any);

        await campHandler.pruefeFortschritt();

        expect(ankuendigungskanalService.holeAnkuendigungskanal)
            .toHaveBeenCalledOnce();

        expect(send)
            .toHaveBeenCalledOnce();

        expect(campService.setCurrentLevel)
            .toHaveBeenCalledWith(1);
    });

    it('kündigt mehrere neu erreichte Camp-Stufen an', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                    ausbau: [
                        'einfache, bequeme Schlafplätze',
                        'trockene Lagerstelle für Holz und Stein',
                    ],
                },
                {
                    phase: 1,
                    stufe: 2,
                    name: 'Feuerstelle & Vorratsplatz',
                    kosten: {
                        baumaterial: 20,
                        vorraete: 85,
                    },
                    ausbau: [
                        'Feuerstelle repariert',
                        'einfacher Kochplatz',
                        'erste gesammelte Vorräte',
                    ],
                },
            ]);

        const send = vi.fn();

        vi.mocked(ankuendigungskanalService.holeAnkuendigungskanal)
            .mockResolvedValue({send} as any);

        await campHandler.pruefeFortschritt();

        expect(send).toHaveBeenCalledTimes(2);
        expect(campService.setCurrentLevel).toHaveBeenNthCalledWith(1, 1);
        expect(campService.setCurrentLevel).toHaveBeenNthCalledWith(2, 2);
    });

    it('bricht ohne Fehler ab, wenn der Ankündigungskanal nicht abrufbar ist', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                    ausbau: [
                        'einfache, bequeme Schlafplätze',
                        'trockene Lagerstelle für Holz und Stein',
                    ],
                },
            ]);

        vi.mocked(ankuendigungskanalService.holeAnkuendigungskanal)
            .mockResolvedValue(null);

        await expect(
            campHandler.pruefeFortschritt()
        ).resolves.toBeUndefined();

        expect(campService.setCurrentLevel)
            .not.toHaveBeenCalled();
    });

    it('speichert die Camp-Stufe nicht, wenn die Ankündigung fehlschlägt', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                    ausbau: [
                        'einfache, bequeme Schlafplätze',
                        'trockene Lagerstelle für Holz und Stein',
                    ],
                },
            ]);

        const send = vi.fn()
            .mockRejectedValue(new Error('Discord-Fehler'));

        vi.mocked(ankuendigungskanalService.holeAnkuendigungskanal)
            .mockResolvedValue({send} as any);

        await expect(campHandler.pruefeFortschritt())
            .rejects.toThrow('Discord-Fehler');

        expect(campService.setCurrentLevel)
            .not.toHaveBeenCalled();
    });

    it('speichert eine erreichte Camp-Stufe ohne Ankündigungskanal nicht', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                    ausbau: [
                        'einfache, bequeme Schlafplätze',
                        'trockene Lagerstelle für Holz und Stein',
                    ],
                },
            ]);

        vi.mocked(ankuendigungskanalService.holeAnkuendigungskanal)
            .mockResolvedValue(null);

        await campHandler.pruefeFortschritt();

        expect(campService.setCurrentLevel)
            .not.toHaveBeenCalled();
    });
});
