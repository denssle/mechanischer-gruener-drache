import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('./sport.service.js', () => ({
    default: {
        getEntriesSince: vi.fn(),
    },
}));

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

import sportService from './sport.service.js';
import redisService from './redis.service.js';
import campService from './camp.service.js';

describe('CampService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechnet Kilometer und Aktivitätsminuten in Camp-Ressourcen um', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometer: 25,
                minuten: 40,
            },
        ]);


        const ressourcen = await campService.getCampRessourcen(new Date('2026-01-01'));

        expect(ressourcen).toEqual({
            baumaterial: 2.5,
            vorraete: 4,
        });
    });

    it('berechnet die aktuell verfügbaren Ressourcen', () => {
        const insgesamt = {
            baumaterial: 22.5,
            vorraete: 95,
        };

        const verbraucht = {
            baumaterial: 15,
            vorraete: 80,
        };

        const result = campService.getVerfuegbareRessourcen(insgesamt, verbraucht);

        expect(result).toEqual({
            baumaterial: 7.5,
            vorraete: 15,
        });
    });

    it('summiert Ressourcen aus mehreren Sporteinträgen', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometer: 15,
            },
            {
                minuten: 30,
            },
            {
                kilometer: 20,
                minuten: 10,
            },
        ]);

        const ressourcen = await campService.getCampRessourcen(new Date('2026-01-01'));

        expect(ressourcen).toEqual({
            baumaterial: 3.5,
            vorraete: 4,
        });
    });

    it('gibt ohne Sporteinträge keine Camp-Ressourcen zurück', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([]);

        const ressourcen = await campService.getCampRessourcen(new Date('2026-01-01'));

        expect(ressourcen).toEqual({
            baumaterial: 0,
            vorraete: 0,
        });
    });

    it('liest den aktuellen Camp-Level aus Redis', async () => {
        vi.mocked(redisService.get).mockResolvedValue('3');

        const level = await campService.getCurrentLevel();

        expect(level).toBe(3);
    });

    it('steigt automatisch eine Camp-Stufe auf, wenn genug Ressourcen vorhanden sind', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometer: 150,
                minuten: 800,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        await campService.pruefeCampFortschritt(new Date('2026-09-19'));

        expect(redisService.set).toHaveBeenCalledWith(
            'CAMP:CURRENT_LEVEL',
            '1'
        );
    });

    it('startet bei Level 0, wenn noch kein Camp-Level gespeichert ist', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        const level = await campService.getCurrentLevel();

        expect(level).toBe(0);
    });

    it('gibt bei Level 0 die erste Camp-Stufe als nächste Stufe zurück', () => {
        const result = campService.getNaechsteStufe(0);

        expect(result).toEqual({
            phase: 1,
            stufe: 1,
            name: 'Bewohnbares Lager',
            kosten: {
                baumaterial: 15,
                vorraete: 80,
            },
        });
    });

    it('gibt die zweite Camp-Stufe als nächste Stufe zurück', () => {
        const result = campService.getNaechsteStufe(1);

        expect(result).toEqual({
            phase: 1,
            stufe: 2,
            name: 'Feuerstelle & Vorratsplatz',
            kosten: {
                baumaterial: 20,
                vorraete: 85,
            },
        });
    });

    it('gibt undefined zurück, wenn keine weitere Camp-Stufe definiert ist', () => {
        const result = campService.getNaechsteStufe(2);

        expect(result).toBeUndefined();
    });

    it('speichert den aktuellen Camp-Level in Redis', async () => {
        await campService.setCurrentLevel(3);

        expect(redisService.set).toHaveBeenCalledWith(
            'CAMP:CURRENT_LEVEL',
            '3'
        );
    });

    it('berechnet bei Level 0 keine verbrauchten Ressourcen', () => {
        const result = campService.getVerbrauchteRessourcen(0);

        expect(result).toEqual({
            baumaterial: 0,
            vorraete: 0,
        });
    });

    it('summiert die Ressourcen mehrerer abgeschlossener Stufen', () => {
        const result = campService.getVerbrauchteRessourcen(2);

        expect(result).toEqual({
            baumaterial: 35,
            vorraete: 165,
        });
    });

    it('berechnet die Ressourcen der abgeschlossenen Stufen', () => {
        const result = campService.getVerbrauchteRessourcen(1);

        expect(result).toEqual({
            baumaterial: 15,
            vorraete: 80,
        });
    });

    it('erkennt, wenn genug Ressourcen für die nächste Stufe vorhanden sind', () => {
        const ressourcen = {
            baumaterial: 15,
            vorraete: 80,
        };

        const naechsteStufe = campService.getNaechsteStufe(0);

        expect(
            campService.kannStufeAbschliessen(ressourcen, naechsteStufe)
        ).toBe(true);
    });

    it('ermittelt den vollständigen Camp-Fortschritt', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometer: 150,
                minuten: 800,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        const result = await campService.getCampFortschritt(
            new Date('2026-09-19')
        );

        expect(result).toEqual({
            aktuell: {
                baumaterial: 15,
                vorraete: 80,
            },
            insgesamt: {
                baumaterial: 15,
                vorraete: 80,
            },
            naechsteStufe: {
                phase: 1,
                stufe: 1,
                name: 'Bewohnbares Lager',
                kosten: {
                    baumaterial: 15,
                    vorraete: 80,
                },
            },
        });
    });


    it('steigt mehrere Camp-Stufen auf, wenn genug Ressourcen vorhanden sind', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometer: 350,
                minuten: 1650,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        await campService.pruefeCampFortschritt(new Date('2026-09-19'));

        expect(redisService.set).toHaveBeenCalledWith(
            'CAMP:CURRENT_LEVEL',
            '2'
        );
    });

    it('ändert den Camp-Level nicht, wenn die Ressourcen nicht ausreichen', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometer: 100,
                minuten: 500,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        await campService.pruefeCampFortschritt(new Date('2026-09-19'));

        expect(redisService.set).not.toHaveBeenCalled();
    });

    it('schließt eine Stufe nicht ab, wenn Baumaterial fehlt', () => {
        const ressourcen = {
            baumaterial: 14.9,
            vorraete: 80,
        };

        const naechsteStufe = campService.getNaechsteStufe(0);

        expect(
            campService.kannStufeAbschliessen(ressourcen, naechsteStufe)
        ).toBe(false);
    });

    it('schließt eine Stufe nicht ab, wenn Vorräte fehlen', () => {
        const ressourcen = {
            baumaterial: 15,
            vorraete: 79.9,
        };

        const naechsteStufe = campService.getNaechsteStufe(0);

        expect(
            campService.kannStufeAbschliessen(ressourcen, naechsteStufe)
        ).toBe(false);
    });

    it('schließt keine Stufe ab, wenn keine nächste Stufe existiert', () => {
        const ressourcen = {
            baumaterial: 100,
            vorraete: 1000,
        };

        const naechsteStufe = campService.getNaechsteStufe(2);

        expect(
            campService.kannStufeAbschliessen(ressourcen, naechsteStufe)
        ).toBe(false);
    });
});