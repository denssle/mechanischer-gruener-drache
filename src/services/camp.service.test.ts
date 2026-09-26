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

    it('ermittelt den vollständigen Camp-Fortschritt', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometers: 150,
                minutes: 800,
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

    it('liefert den Camp-Fortschritt seit dem gespeicherten Staffelstart', async () => {
        vi.mocked(redisService.get).mockImplementation(async (key: string) => {
            if (key === 'CAMP:START_DATE') {
                return '2026-10-01T00:00:00.000Z';
            }

            if (key === 'CAMP:CURRENT_LEVEL') {
                return '0';
            }

            return null;
        });

        vi.mocked(sportService.getEntriesSince).mockResolvedValue([]);

        const fortschritt = await campService.getCampFortschrittSeitStart();

        expect(sportService.getEntriesSince).toHaveBeenCalledWith(
            new Date('2026-10-01T00:00:00.000Z')
        );

        expect(fortschritt).toEqual({
            aktuell: {
                baumaterial: 0,
                vorraete: 0,
            },
            insgesamt: {
                baumaterial: 0,
                vorraete: 0,
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

    it('liefert null, wenn das Camp noch nicht gestartet wurde', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        const fortschritt = await campService.getCampFortschrittSeitStart();

        expect(fortschritt).toBeNull();
        expect(sportService.getEntriesSince).not.toHaveBeenCalled();
    });

    it('liest den aktuellen Camp-Level aus Redis', async () => {
        vi.mocked(redisService.get).mockResolvedValue('3');

        const level = await campService.getCurrentLevel();

        expect(level).toBe(3);
    });

    it('speichert den aktuellen Camp-Level in Redis', async () => {
        await campService.setCurrentLevel(3);

        expect(redisService.set).toHaveBeenCalledWith(
            'CAMP:CURRENT_LEVEL',
            '3'
        );
    });

    it('gibt ohne Sporteinträge keine Camp-Ressourcen zurück', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([]);

        const ressourcen = await campService.getCampRessourcen(new Date('2026-01-01'));

        expect(ressourcen).toEqual({
            baumaterial: 0,
            vorraete: 0,
        });
    });

    it('rechnet Kilometer und Aktivitätsminuten in Camp-Ressourcen um', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                id: '1',
                userId: 'user-1',
                activity: 'laufen',
                kilometers: 25,
                minutes: 40,
                createdAt: '2026-01-01T00:00:00.000Z',
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
                id: '1',
                userId: 'user-1',
                activity: 'laufen',
                kilometers: 15,
                createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
                id: '2',
                userId: 'user-1',
                activity: 'krafttraining',
                kilometers: 0,
                minutes: 30,
                createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
                id: '3',
                userId: 'user-1',
                activity: 'laufen',
                kilometers: 20,
                minutes: 10,
                createdAt: '2026-01-01T00:00:00.000Z',
            },
        ]);

        const ressourcen = await campService.getCampRessourcen(new Date('2026-01-01'));

        expect(ressourcen).toEqual({
            baumaterial: 3.5,
            vorraete: 4,
        });
    });

    it('liest das Camp-Startdatum aus Redis', async () => {
        vi.mocked(redisService.get).mockResolvedValue('2026-09-25T00:00:00.000Z');

        const result = await campService.getCampStartDate();

        expect(result).toEqual(new Date('2026-09-25T00:00:00.000Z'));
    });

    it('speichert das Camp-Startdatum in Redis', async () => {
        const date = new Date('2026-09-25T00:00:00.000Z');

        await campService.setCampStartDate(date);

        expect(redisService.set).toHaveBeenCalledWith(
            'CAMP:START_DATE',
            '2026-09-25T00:00:00.000Z'
        );
    });

    it('setzt das Camp-Startdatum, wenn noch keines vorhanden ist', async () => {
        const startDate = new Date('2026-09-25T00:00:00.000Z');

        vi.mocked(redisService.get).mockResolvedValue(null);

        await campService.initialisiereCamp(startDate);

        expect(redisService.set).toHaveBeenCalledWith(
            'CAMP:START_DATE',
            '2026-09-25T00:00:00.000Z'
        );
    });

    it('überschreibt ein vorhandenes Camp-Startdatum nicht', async () => {
        vi.mocked(redisService.get).mockResolvedValue('2026-09-20T00:00:00.000Z');

        await campService.initialisiereCamp(
            new Date('2026-09-25T00:00:00.000Z')
        );

        expect(redisService.set).not.toHaveBeenCalled();
    });

    it('gibt null zurück, wenn noch kein Camp-Startdatum gespeichert ist', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        const result = await campService.getCampStartDate();

        expect(result).toBeNull();
    });

    it('prüft keinen Camp-Fortschritt, wenn das Camp noch nicht gestartet wurde', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        const result = await campService.pruefeCampFortschrittSeitStart();

        expect(result).toEqual([]);
        expect(sportService.getEntriesSince).not.toHaveBeenCalled();
    });

    it('prüft den Camp-Fortschritt ab dem gespeicherten Startdatum', async () => {
        vi.mocked(redisService.get)
            .mockResolvedValueOnce('2026-09-25T00:00:00.000Z')
            .mockResolvedValueOnce('0');

        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                id: '1',
                userId: 'user-1',
                activity: 'laufen',
                kilometers: 150,
                minutes: 800,
                createdAt: '2026-09-25T00:00:00.000Z',
            },
        ]);

        const result = await campService.pruefeCampFortschrittSeitStart();

        expect(sportService.getEntriesSince).toHaveBeenCalledWith(
            new Date('2026-09-25T00:00:00.000Z')
        );

        expect(result).toEqual([
            {
                phase: 1,
                stufe: 1,
                name: 'Bewohnbares Lager',
                kosten: {
                    baumaterial: 15,
                    vorraete: 80,
                },
            },
        ]);
    });

    it('steigt automatisch eine Camp-Stufe auf, wenn genug Ressourcen vorhanden sind', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                id: '1',
                userId: 'user-1',
                activity: 'laufen',
                kilometers: 150,
                minutes: 800,
                createdAt: '2026-09-19T00:00:00.000Z',
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        const result = await campService.pruefeCampFortschritt(
            new Date('2026-09-19')
        );

        expect(result).toHaveLength(1);
        expect(redisService.set).not.toHaveBeenCalled();
    });

    it('gibt die neu abgeschlossene Camp-Stufe zurück', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                id: '1',
                userId: 'user-1',
                activity: 'laufen',
                kilometers: 150,
                minutes: 800,
                createdAt: '2026-09-19T00:00:00.000Z',
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        const result = await campService.pruefeCampFortschritt(
            new Date('2026-09-19')
        );

        expect(result).toEqual([
            {
                phase: 1,
                stufe: 1,
                name: 'Bewohnbares Lager',
                kosten: {
                    baumaterial: 15,
                    vorraete: 80,
                },
            },
        ]);

        expect(redisService.set).not.toHaveBeenCalled();
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

    it('steigt mehrere Camp-Stufen auf, wenn genug Ressourcen vorhanden sind', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometers: 350,
                minutes: 1650,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        const result = await campService.pruefeCampFortschritt(
            new Date('2026-09-19')
        );

        expect(result).toHaveLength(2);
        expect(redisService.set).not.toHaveBeenCalled();
    });

    it('ändert den Camp-Level nicht, wenn die Ressourcen nicht ausreichen', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometers: 100,
                minutes: 500,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        await campService.pruefeCampFortschritt(new Date('2026-09-19'));

        expect(redisService.set).not.toHaveBeenCalled();
    });

    it('gibt keine abgeschlossene Stufe zurück, wenn die Ressourcen nicht ausreichen', async () => {
        vi.mocked(sportService.getEntriesSince).mockResolvedValue([
            {
                kilometers: 100,
                minutes: 500,
            },
        ] as never);

        vi.mocked(redisService.get).mockResolvedValue('0');

        const result = await campService.pruefeCampFortschritt(
            new Date('2026-09-19')
        );

        expect(result).toEqual([]);
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
