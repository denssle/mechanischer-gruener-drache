import redisService from './redis.service.js';

// Geburtstagskalender: wer seinen Geburtstag hinterlegt, bekommt am Tag einen Glückwunsch in den
// konfigurierten Kanal (Kanal wird über /config gesetzt). Das JAHR IST OPTIONAL - wer es weglässt,
// bekommt den Glückwunsch ohne Altersangabe. Gespeichert wird nur, was die Person selbst einträgt.
// Dokumentiert in docs/datenhaltung.md.

export interface Geburtstag {
    tag: number;          // 1-31
    monat: number;        // 1-12
    jahr: number | null;  // null = bewusst nicht angegeben
}

const KEYS = {
    // Hash userId → Datum. Speicherform: 'TT.MM' bzw. 'TT.MM.JJJJ' (siehe formatGespeichert).
    daten: 'GEBURTSTAG:DATEN',
    channel: 'GEBURTSTAG:CHANNEL',
    // Tagesmarker (YYYY-MM-DD) der zuletzt geposteten Glückwunsch-Runde - Doppelpost-Schutz, weil
    // der Minuten-Timer sonst ab der Gratulationszeit jede Minute erneut posten würde.
    lastDay: 'GEBURTSTAG:LAST_DAY',
};

// Speicherform: die deutsche Schreibweise ohne Jahr bzw. mit. Bewusst menschenlesbar - der Wert
// landet auch mal beim Debuggen in einem Log, und ein 'TT.MM' ist dort sofort verständlich.
export function formatGespeichert(geburtstag: Geburtstag): string {
    const tag = String(geburtstag.tag).padStart(2, '0');
    const monat = String(geburtstag.monat).padStart(2, '0');
    return geburtstag.jahr === null ? `${tag}.${monat}` : `${tag}.${monat}.${geburtstag.jahr}`;
}

// Umkehrung. null bei allem, was nicht dem erwarteten Format entspricht - ein kaputter Wert soll
// den Kalender nicht zum Absturz bringen, sondern einfach übergangen werden.
export function parseGespeichert(wert: string): Geburtstag | null {
    const treffer = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(wert.trim());
    if (!treffer) {
        return null;
    }
    const tag = Number(treffer[1]);
    const monat = Number(treffer[2]);
    if (monat < 1 || monat > 12 || tag < 1 || tag > 31) {
        return null;
    }
    return {tag, monat, jahr: treffer[3] ? Number(treffer[3]) : null};
}

class GeburtstagService {
    async setGeburtstag(userId: string, geburtstag: Geburtstag): Promise<void> {
        await redisService.setHashField(KEYS.daten, userId, formatGespeichert(geburtstag));
    }

    async entferneGeburtstag(userId: string): Promise<void> {
        await redisService.deleteHashField(KEYS.daten, userId);
    }

    async getGeburtstag(userId: string): Promise<Geburtstag | null> {
        const alle = await redisService.getHashAll(KEYS.daten);
        const wert = alle[userId];
        return wert === undefined ? null : parseGespeichert(wert);
    }

    // Alle hinterlegten Geburtstage. Unlesbare Einträge werden übersprungen statt durchgereicht -
    // der tägliche Post soll an einem kaputten Wert nicht scheitern.
    async getAlle(): Promise<Record<string, Geburtstag>> {
        const alle = await redisService.getHashAll(KEYS.daten);
        const ergebnis: Record<string, Geburtstag> = {};
        for (const [userId, wert] of Object.entries(alle)) {
            const geburtstag = parseGespeichert(wert);
            if (geburtstag) {
                ergebnis[userId] = geburtstag;
            } else {
                console.warn(`Unlesbarer Geburtstags-Eintrag für ${userId}: "${wert}" - wird übersprungen.`);
            }
        }
        return ergebnis;
    }

    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async getLastPostDay(): Promise<string | null> {
        return redisService.get(KEYS.lastDay);
    }

    async setLastPostDay(day: string): Promise<void> {
        await redisService.set(KEYS.lastDay, day);
    }
}

export default new GeburtstagService();
