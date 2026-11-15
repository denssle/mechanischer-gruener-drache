import {TextChannel} from 'discord.js';
import client from '../client.js';
import sportService from './sport.service.js';
import {holeOderWarne} from './fehler.service.js';

class AnkuendigungskanalService {
    async holeAnkuendigungskanal(): Promise<TextChannel | null> {
        const channelId = await sportService.getAnnouncementChannel();

        if (!channelId) {
            return null;
        }

        return await holeOderWarne(client.channels.fetch(channelId),
            `Ankündigungskanal ${channelId} nicht abrufbar, Meldung wird verworfen`) as TextChannel | null;
    }
}

export default new AnkuendigungskanalService();
