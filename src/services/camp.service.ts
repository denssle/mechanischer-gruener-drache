import sportService from './sport.service.js';
import redisService from './redis.service.js';
import {CampRessourcen, CampStufe, CampFortschritt} from '../types/camp.js';
import {CAMP_STUFEN} from '../data/camp.js';

const KILOMETER_PRO_BAUMATERIAL = 10;
const MINUTEN_PRO_VORRAT = 10;

const KEYS = {
    currentLevel: 'CAMP:CURRENT_LEVEL',
};

class CampService {
    async getCampRessourcen(startDate: Date): Promise<CampRessourcen> {
        const entries = await sportService.getEntriesSince(startDate);

        let kilometer = 0;
        let minuten = 0;

        for (const entry of entries) {
            kilometer += entry.kilometer ?? 0;
            minuten += entry.minuten ?? 0;
        }

        return {
            baumaterial: kilometer / KILOMETER_PRO_BAUMATERIAL,
            vorraete: minuten / MINUTEN_PRO_VORRAT,
        };
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

    async pruefeCampFortschritt(startDate: Date): Promise<void> {
        const insgesamt = await this.getCampRessourcen(startDate);
        let currentLevel = await this.getCurrentLevel();

        while (true) {
            const verbraucht = this.getVerbrauchteRessourcen(currentLevel);
            const verfuegbar = this.getVerfuegbareRessourcen(insgesamt, verbraucht);
            const naechsteStufe = this.getNaechsteStufe(currentLevel);

            if (!this.kannStufeAbschliessen(verfuegbar, naechsteStufe)) {
                break;
            }

            currentLevel++;
            await this.setCurrentLevel(currentLevel);
        }
    }

    async getCampFortschritt(startDate: Date): Promise<CampFortschritt> {
        const insgesamt = await this.getCampRessourcen(startDate);
        const currentLevel = await this.getCurrentLevel();
        const verbraucht = this.getVerbrauchteRessourcen(currentLevel);
        const aktuell = this.getVerfuegbareRessourcen(insgesamt, verbraucht);
        const naechsteStufe = this.getNaechsteStufe(currentLevel);

        return {
            aktuell,
            insgesamt,
            naechsteStufe: naechsteStufe,
        };
    }
}

export default new CampService();