import sportService from './sport.service.js';
import redisService from './redis.service.js';
import {CampRessourcen, CampStufe, CampFortschritt} from '../types/camp.js';
import {CAMP_STARTPHASE, CAMP_STUFEN} from '../data/camp.js';

interface CampFortschrittsPruefung {
    currentLevel: number;
    erreichteStufen: CampStufe[];
}

const KILOMETER_PRO_BAUMATERIAL = 10;
const MINUTEN_PRO_VORRAT = 10;

const KEYS = {
    currentLevel: 'CAMP:CURRENT_LEVEL',
    startDate: 'CAMP:START_DATE',
};

class CampService {
    async getCampRessourcen(startDate: Date): Promise<CampRessourcen> {
        const entries = await sportService.getEntriesSince(startDate);

        let kilometer = 0;
        let minuten = 0;

        for (const entry of entries) {
            kilometer += entry.kilometers ?? 0;
            minuten += entry.minutes ?? 0;
        }

        return {
            baumaterial: kilometer / KILOMETER_PRO_BAUMATERIAL,
            vorraete: minuten / MINUTEN_PRO_VORRAT,
        };
    }

    async getCampStartDate(): Promise<Date | null> {
        const value = await redisService.get(KEYS.startDate);

        if (value === null) {
            return null;
        }

        return new Date(value);
    }

    async setCampStartDate(date: Date): Promise<void> {
        await redisService.set(KEYS.startDate, date.toISOString());
    }

    async initialisiereCamp(startDate: Date): Promise<void> {
        const vorhandenesStartDate = await this.getCampStartDate();

        if (vorhandenesStartDate !== null) {
            return;
        }

        await this.setCampStartDate(startDate);
    }

    async pruefeCampFortschrittSeitStart(): Promise<CampFortschrittsPruefung | null> {
        const startDate = await this.getCampStartDate();

        if (startDate === null) {
            return null;
        }

        return this.pruefeCampFortschritt(startDate);
    }

    async getCurrentLevel(): Promise<number> {
        const level = await redisService.get(KEYS.currentLevel);

        return level ? Number(level) : 0;
    }

    async setCurrentLevel(level: number): Promise<void> {
        await redisService.set(KEYS.currentLevel, String(level));
    }

    getVerbrauchteRessourcen(currentLevel: number): CampRessourcen {
        const abgeschlosseneStufen = CAMP_STUFEN.slice(0, currentLevel);

        let baumaterial = 0;
        let vorraete = 0;

        for (const stufe of abgeschlosseneStufen) {
            baumaterial += stufe.kosten.baumaterial;
            vorraete += stufe.kosten.vorraete;
        }

        return {
            baumaterial,
            vorraete,
        };
    }

    getNaechsteStufe(currentLevel: number): CampStufe | undefined {
        return CAMP_STUFEN[currentLevel];
    }

    getVerfuegbareRessourcen(
        insgesamt: CampRessourcen,
        verbraucht: CampRessourcen
    ): CampRessourcen {
        return {
            baumaterial: insgesamt.baumaterial - verbraucht.baumaterial,
            vorraete: insgesamt.vorraete - verbraucht.vorraete,
        };
    }

    kannStufeAbschliessen(
        ressourcen: CampRessourcen,
        stufe: CampStufe | undefined
    ): boolean {
        if (!stufe) return false;

        return (
            ressourcen.baumaterial >= stufe.kosten.baumaterial &&
            ressourcen.vorraete >= stufe.kosten.vorraete
        );
    }

    async pruefeCampFortschritt(
        startDate: Date
    ): Promise<CampFortschrittsPruefung> {
        const insgesamt = await this.getCampRessourcen(startDate);
        const currentLevel = await this.getCurrentLevel();

        let pruefLevel = currentLevel;
        const erreichteStufen: CampStufe[] = [];

        while (true) {
            const verbraucht = this.getVerbrauchteRessourcen(pruefLevel);
            const verfuegbar = this.getVerfuegbareRessourcen(insgesamt, verbraucht);
            const naechsteStufe = this.getNaechsteStufe(pruefLevel);

            if (!this.kannStufeAbschliessen(verfuegbar, naechsteStufe)) {
                break;
            }

            erreichteStufen.push(naechsteStufe!);
            pruefLevel++;
        }

        return {
            currentLevel,
            erreichteStufen,
        };
    }

    async getCampFortschritt(startDate: Date): Promise<CampFortschritt> {
        const insgesamt = await this.getCampRessourcen(startDate);
        const currentLevel = await this.getCurrentLevel();

        const aktuelleStufe =
            currentLevel === 0
                ? CAMP_STARTPHASE
                : CAMP_STUFEN[currentLevel - 1];

        const verbraucht = this.getVerbrauchteRessourcen(currentLevel);
        const aktuell = this.getVerfuegbareRessourcen(insgesamt, verbraucht);
        const naechsteStufe = this.getNaechsteStufe(currentLevel);

        return {
            aktuell,
            insgesamt,
            aktuelleStufe,
            naechsteStufe,
        };
    }

    async getCampFortschrittSeitStart(): Promise<CampFortschritt | null> {
        const startDate = await this.getCampStartDate();

        if (startDate === null) {
            return null;
        }

        return this.getCampFortschritt(startDate);
    }
}

export default new CampService();
