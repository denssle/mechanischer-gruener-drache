import {ChatInputCommandInteraction} from 'discord.js';
import newsService from '../services/news.service.js';

// Discord-Nachrichtenlimit ist 2000 Zeichen; Body vorher kürzen, Rest über den Link.
const MAX_TEXT_LENGTH = 1500;

class NewsHandler {
    async handleNews(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const news = await newsService.getLatestNews();
        if (!news) {
            return interaction.editReply('❌ Konnte die aktuellen News gerade nicht abrufen. Versuch es später nochmal.');
        }

        let text = news.text;
        if (text.length > MAX_TEXT_LENGTH) {
            text = text.slice(0, MAX_TEXT_LENGTH).trimEnd() + ' …';
        }

        return interaction.editReply(
            `📰 **${news.title}**\n_${news.date}_\n\n${text}\n\n🔗 Weiterlesen: <${news.url}>`
        );
    }
}

export default new NewsHandler();
