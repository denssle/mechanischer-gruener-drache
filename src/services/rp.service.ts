import redisService from './redis.service.js';

// Art der gesuchten Roleplay-Runde. 'beides' = sowohl PbP als auch live.
export type RpArt = 'pbp' | 'live' | 'beides';

const KEYS = {
    // Hash userId → Art. Nur wer aktuell sucht, steht drin; Abmelden entfernt das Feld wieder.
    // Bewusst simpel: kein Zeitstempel, kein Ablaufen (siehe README-Todo/Datenhaltung).
    suchende: 'RP:SUCHENDE',
};

class RpService {
    async setSuchend(userId: string, art: RpArt): Promise<void> {
        await redisService.setHashField(KEYS.suchende, userId, art);
    }

    async entferneSuchend(userId: string): Promise<void> {
        await redisService.deleteHashField(KEYS.suchende, userId);
    }

    // Nur die Mitgliedschaft prüfen (HEXISTS), ohne den ganzen Hash zu holen - für handleBeenden.
    async istSuchend(userId: string): Promise<boolean> {
        return redisService.hashFieldExists(KEYS.suchende, userId);
    }

    async getSuchende(): Promise<Record<string, RpArt>> {
        return redisService.getHashAll(KEYS.suchende) as Promise<Record<string, RpArt>>;
    }
}

export default new RpService();
