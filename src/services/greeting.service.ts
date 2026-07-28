import redisService from './redis.service.js';

const KEYS = {
    channel: 'GREETING:CHANNEL',
    // Hash userId → Datum (YYYY-MM-DD) der zuletzt begrüßten ersten Nachricht dieser Person am Tag -
    // Doppelgruß-Schutz PRO Person, damit jede:r am Tag der eigenen ersten Nachricht begrüßt wird.
    // BEWUSST ein anderer Key-Name als früher: bis 1.51.x war 'GREETING:LAST_DAY' ein einfacher STRING
    // (globaler Tagesmarker). Seit dem Wechsel auf einen Hash pro Person würde HGETALL gegen diesen
    // alten String-Key mit WRONGTYPE crashen (→ gar kein Gruß mehr). Neuer Name = keine Kollision;
    // der verwaiste alte String-Key liegt harmlos brach und kann bei Gelegenheit gelöscht werden.
    lastDay: 'GREETING:LAST_DAY_BY_USER',
    // Hash userId → persönliches Emoji, aus der Chat-Historie gelernt (Feld pro Person).
    emoji: 'GREETING:EMOJI',
    // Hash userId → persönliches Emoji, auf /config VON HAND gesetzt. BEWUSST ein eigener Key statt
    // eines Felds im gelernten Hash: der Historien-Scan überschreibt `emoji` bei jedem Lauf, eine
    // Handeingabe soll das aber überdauern (gleiche Überlegung wie beim Ping-Pong-Rekord neben der
    // laufenden Serie). Beim Gruß gilt: manuell vor gelernt vor abgeleitet.
    manuellesEmoji: 'GREETING:EMOJI_MANUELL',
};

class GreetingService {
    async setChannel(channelId: string): Promise<void> {
        await redisService.set(KEYS.channel, channelId);
    }

    async getChannel(): Promise<string | null> {
        return redisService.get(KEYS.channel);
    }

    async getLastGreetingDay(userId: string): Promise<string | null> {
        const alle = await redisService.getHashAll(KEYS.lastDay);
        return alle[userId] ?? null;
    }

    async setLastGreetingDay(userId: string, day: string): Promise<void> {
        await redisService.setHashField(KEYS.lastDay, userId, day);
    }

    async setLearnedEmoji(userId: string, emoji: string): Promise<void> {
        await redisService.setHashField(KEYS.emoji, userId, emoji);
    }

    async getLearnedEmojis(): Promise<Record<string, string>> {
        return redisService.getHashAll(KEYS.emoji);
    }

    async setManualEmoji(userId: string, emoji: string): Promise<void> {
        await redisService.setHashField(KEYS.manuellesEmoji, userId, emoji);
    }

    async getManualEmojis(): Promise<Record<string, string>> {
        return redisService.getHashAll(KEYS.manuellesEmoji);
    }
}

export default new GreetingService();
