import redisService from './redis.service.js';

// Drachentötungs-Gratulation (siehe drachen.handler): pro verknüpftem Charakter das zuletzt
// gesehene Level, dazu der Spielwelt-Ankündigungskanal. Der Kanal-Key heißt bewusst
// SPIELWELT:..., nicht DRACHE:... - künftige Spielwelt-Posts sollen denselben Kanal nutzen
// können, ohne dass ein zweites Kanal-Feld nötig wird.
const KEYS = {
    levels: 'DRACHE:LEVELS',
    gemeldet: (kernName: string) => `DRACHE:GEMELDET:${kernName.toLowerCase()}`,
    channel: 'SPIELWELT:ANNOUNCEMENT_CHANNEL',
};

// Meldesperre nach einer Gratulation: der Roster ist bis zu 10 min gecacht und kann nach einer
// frischen Tötung (Online-Tabelle: Stufe 1) noch die alte Stufe 15 liefern - die würde als
// "neuer Stand" gespeichert und der nächste frische Abruf gratulierte ein zweites Mal. 24 h sind
// bequem sicher: bis zum nächsten Drachen vergehen viele Spieltage (Muster WATCH:GEMELDET).
export const MELDESPERRE_SECONDS = 24 * 60 * 60;

class DrachenService {
    // Zuletzt gesehene Level je Kern-Name (Werte als Strings, geparst wird im Handler).
    async getLevels(): Promise<Record<string, string>> {
        return redisService.getHashAll(KEYS.levels);
    }

    async setLevel(kernName: string, level: number): Promise<void> {
        await redisService.setHashField(KEYS.levels, kernName, level.toString());
    }

    // Beim Entfernen der Verknüpfung mit aufräumen - sonst bleibt der Level-Stand als Karteileiche.
    async deleteLevel(kernName: string): Promise<void> {
        await redisService.deleteHashField(KEYS.levels, kernName);
    }

    async istGemeldet(kernName: string): Promise<boolean> {
        return await redisService.get(KEYS.gemeldet(kernName)) !== null;
    }

    async merkeGemeldet(kernName: string): Promise<void> {
        await redisService.setWithExpiry(KEYS.gemeldet(kernName), '1', MELDESPERRE_SECONDS);
    }

    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }
}

export default new DrachenService();
