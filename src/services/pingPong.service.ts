import redisService, {REDIS_KEYS} from './redis.service.js';

// Season-State des Ping-Pong-Features: die Punkte laufen monatsweise, am Monatswechsel wird
// abgerechnet (Champion-Rolle + Ruhmeshallen-Eintrag), danach werden die Scores zurückgesetzt.
// Enthält den Season-State und die Keys des laufenden Spielbetriebs; die Spiel- und
// Anzeigelogik liegt in pingPong.handler.ts (Duelle) und pingPongSeason.handler.ts (Abrechnung).
// Dokumentiert in docs/datenhaltung.md.

// Keys des laufenden Spielbetriebs. Das Format von `score`/`highscore` ist aus Legacy-Gründen
// festgelegt (`<userId>PING_PONG` bzw. das Sorted Set `PING_PONG`) - eine Änderung würde alle
// bestehenden Punktestände verwaisen lassen. Der Score liegt bewusst DOPPELT (Einzelkey je User
// und Sorted Set); wer ihn schreibt, muss beide Orte bedienen, wer ihn löscht (Season-Reset)
// ebenfalls. Hier statt im Handler, weil sich Duell- und Season-Handler dieselben Keys teilen.
export const PING_PONG_KEYS = {
    score: (userId: string) => userId + REDIS_KEYS.PING_PONG,
    highscore: REDIS_KEYS.PING_PONG,
    cooldown: (userId: string) => `PING_PONG:COOLDOWN:${userId}`,
    serie: (userId: string) => `PING_PONG:SERIE:${userId}`,
    rekord: (userId: string) => `PING_PONG:REKORD:${userId}`,
};

export interface RuhmeshalleEintrag {
    monat: string;   // YYYY-MM
    userId: string;
    punkte: number;
}

const KEYS = {
    // Zuletzt abgerechneter Monat als YYYY-MM. Fehlt er, wurde noch nie abgerechnet - dann setzt
    // rechneSeasonAb ihn ohne Abrechnung auf den laufenden Monat (kein Überraschungs-Reset beim
    // ersten Deploy).
    lastSeason: 'PING_PONG:LAST_SEASON',
    // Hash: Feld = YYYY-MM, Wert = JSON {userId, punkte}. Bewusst nur die ID - der Name wird zur
    // Anzeigezeit aufgelöst, kein eingefrorener Anzeigename.
    ruhmeshalle: 'PING_PONG:RUHMESHALLE',
    // Rolle des amtierenden Champions (über /config gesetzt, optional).
    championRolle: 'PING_PONG:CHAMPION_ROLE',
};

class PingPongService {
    async getLastSeason(): Promise<string | null> {
        return redisService.get(KEYS.lastSeason);
    }

    async setLastSeason(monat: string): Promise<void> {
        await redisService.set(KEYS.lastSeason, monat);
    }

    async getChampionRole(): Promise<string | null> {
        return redisService.get(KEYS.championRolle);
    }

    async setChampionRole(rolleId: string): Promise<void> {
        await redisService.set(KEYS.championRolle, rolleId);
    }

    async removeChampionRole(): Promise<void> {
        await redisService.delete(KEYS.championRolle);
    }

    // Trägt den Champion eines Monats ein - aber nur, wenn für diesen Monat noch keiner feststeht.
    // Der Rückgabewert sagt, ob geschrieben wurde. Grund für den Schutz: bricht die Abrechnung
    // zwischen Eintrag und Reset ab, läuft sie eine Minute später erneut und sähe nur noch die
    // Reste im Sorted Set - ein blindes Überschreiben würde den echten Champion still ersetzen.
    async addRuhmeshalleEintrag(monat: string, userId: string, punkte: number): Promise<boolean> {
        if (await redisService.hashFieldExists(KEYS.ruhmeshalle, monat)) {
            return false;
        }
        await redisService.setHashField(KEYS.ruhmeshalle, monat, JSON.stringify({userId, punkte}));
        return true;
    }

    // Absteigend nach Monat (der jüngste zuerst). Unlesbare Einträge werden übersprungen statt
    // durchgereicht - ein kaputter Wert darf die Ruhmeshalle nicht mitreißen (Muster getAlle()
    // im Geburtstags-Service).
    async getRuhmeshalle(): Promise<RuhmeshalleEintrag[]> {
        const alle = await redisService.getHashAll(KEYS.ruhmeshalle);
        const eintraege: RuhmeshalleEintrag[] = [];

        for (const [monat, wert] of Object.entries(alle)) {
            try {
                const {userId, punkte} = JSON.parse(wert) as {userId?: string; punkte?: number};
                if (typeof userId !== 'string' || typeof punkte !== 'number') {
                    console.warn('Unlesbarer Ruhmeshallen-Eintrag übersprungen:', monat, wert);
                    continue;
                }
                eintraege.push({monat, userId, punkte});
            } catch {
                console.warn('Unlesbarer Ruhmeshallen-Eintrag übersprungen:', monat, wert);
            }
        }

        // YYYY-MM sortiert als String genauso wie chronologisch.
        return eintraege.sort((a, b) => b.monat.localeCompare(a.monat));
    }
}

export default new PingPongService();
