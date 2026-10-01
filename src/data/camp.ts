import {CampStufe} from '../types/camp.js';

export const CAMP_STARTPHASE = {
    phase: 0,
    name: 'Verlassenes Lager',
    beschreibung:
        'Das Portal schließt sich hinter euch. Vor euch liegt eine überwucherte Lichtung mit den Resten eines alten Lagers. ' +
        'Die Feuerstelle ist längst erloschen, der Unterstand halb eingestürzt und von früheren Schlafplätzen ist kaum noch etwas übrig. ' +
        'Immerhin: Das hier könnte mit etwas Arbeit ein Zuhause werden.',
};

export const CAMP_STUFEN: CampStufe[] = [
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
];