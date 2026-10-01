export interface CampRessourcen {
    baumaterial: number;
    vorraete: number;
}

export interface CampStufe {
    phase: number;
    stufe: number;
    name: string;
    kosten: CampRessourcen;
}

export interface CampFortschritt {
    aktuell: CampRessourcen;
    insgesamt: CampRessourcen;
    aktuelleStufe: {
        phase: number;
        name: string;
    };
    naechsteStufe?: CampStufe;
}
