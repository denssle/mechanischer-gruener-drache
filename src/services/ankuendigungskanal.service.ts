import {TextChannel} from 'discord.js';
import client from '../client.js';
import sportService from './sport.service.js';

class AnkuendigungskanalService {
    async holeAnkuendigungskanal(): Promise<TextChannel | null> {
        const channelId = await sportService.getAnnouncementChannel();

        if (!channelId) {
            return null;
        }

        const channel = await client.channels.fetch(channelId)
            .catch(() => null) as TextChannel | null;

        if (!channel) {
            console.warn(
                `⚠️ Ankündigungskanal ${channelId} nicht abrufbar - Meldung wird verworfen.`
            );
            return null;
        }

        return channel;
    }
}

export default new AnkuendigungskanalService();
