import {CampStufe} from '../types/camp.js';

    // Phase 0, der Ausgangspunkt; keine Kosten
export const CAMP_STARTPHASE = {
    phase: 0,
    name: 'Verlassenes Lager',
};

export const CAMP_STUFEN: CampStufe[] = [
    // Phase 1 – Bewohnbares Lager
    {
        phase: 1,
        stufe: 1,
        name: 'Bewohnbares Lager',
        kosten: {
            baumaterial: 15,
            vorraete: 80,
        },
    },
    {
        phase: 1,
        stufe: 2,
        name: 'Feuerstelle & Vorratsplatz',
        kosten: {
            baumaterial: 20,
            vorraete: 85,
        },
    },
    {
        phase: 1,
        stufe: 3,
        name: 'Wetterfeste Unterstände',
        kosten: {
            baumaterial: 20,
            vorraete: 90,
        },
    },
    {
        phase: 1,
        stufe: 4,
        name: 'Gemeinsamer Lagerplatz',
        kosten: {
            baumaterial: 25,
            vorraete: 95,
        },
    },
    {
        phase: 1,
        stufe: 5,
        name: 'Festes Basislager',
        kosten: {
            baumaterial: 25,
            vorraete: 100,
        },
    },

    // Phase 2 – Kleine Siedlung
    {
        phase: 2,
        stufe: 1,
        name: 'Erste Wohnhütte',
        kosten: {
            baumaterial: 30,
            vorraete: 105,
        },
    },
    {
        phase: 2,
        stufe: 2,
        name: 'Gemeinschaftsküche',
        kosten: {
            baumaterial: 30,
            vorraete: 110,
        },
    },
    {
        phase: 2,
        stufe: 3,
        name: 'Wasserversorgung',
        kosten: {
            baumaterial: 35,
            vorraete: 115,
        },
    },
    {
        phase: 2,
        stufe: 4,
        name: 'Werkstatt',
        kosten: {
            baumaterial: 35,
            vorraete: 120,
        },
    },
    {
        phase: 2,
        stufe: 5,
        name: 'Wachsende Siedlung',
        kosten: {
            baumaterial: 40,
            vorraete: 125,
        },
    },
    {
        phase: 2,
        stufe: 6,
        name: 'Kleine Siedlung',
        kosten: {
            baumaterial: 40,
            vorraete: 130,
        },
    },

    // Phase 3 – Dorf
    {
        phase: 3,
        stufe: 1,
        name: 'Wohnviertel',
        kosten: {
            baumaterial: 45,
            vorraete: 135,
        },
    },
    {
        phase: 3,
        stufe: 2,
        name: 'Schmiede & Handwerk',
        kosten: {
            baumaterial: 45,
            vorraete: 140,
        },
    },
    {
        phase: 3,
        stufe: 3,
        name: 'Landwirtschaft',
        kosten: {
            baumaterial: 50,
            vorraete: 145,
        },
    },
    {
        phase: 3,
        stufe: 4,
        name: 'Taverne & Gasthaus',
        kosten: {
            baumaterial: 50,
            vorraete: 150,
        },
    },
    {
        phase: 3,
        stufe: 5,
        name: 'Bade- & Waschhaus',
        kosten: {
            baumaterial: 55,
            vorraete: 155,
        },
    },
    {
        phase: 3,
        stufe: 6,
        name: 'Bibliothek & Schreibstube',
        kosten: {
            baumaterial: 55,
            vorraete: 160,
        },
    },
    {
        phase: 3,
        stufe: 7,
        name: 'Markt & Bäckerei',
        kosten: {
            baumaterial: 60,
            vorraete: 165,
        },
    },
    {
        phase: 3,
        stufe: 8,
        name: 'Ausgebautes Dorf',
        kosten: {
            baumaterial: 60,
            vorraete: 170,
        },
    },
];
