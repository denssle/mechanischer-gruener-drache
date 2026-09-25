import {CampStufe} from '../types/camp.js';

export const CAMP_STUFEN: CampStufe[] = [
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
];