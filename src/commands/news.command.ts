import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import newsHandler from '../handlers/news.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('news')
        .setDescription('Zeigt die neuesten News aus dem Spiel (lotgd.de)'),

    async execute(interaction: ChatInputCommandInteraction) {
        await newsHandler.handleNews(interaction);
    }
};
