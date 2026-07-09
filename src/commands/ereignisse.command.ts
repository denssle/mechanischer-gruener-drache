import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import ereignisseHandler from '../handlers/ereignisse.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ereignisse')
        .setDescription('Zeigt die neuesten Ereignisse aus dem Spiel (lotgd.de)'),

    async execute(interaction: ChatInputCommandInteraction) {
        await ereignisseHandler.handleEreignisse(interaction);
    }
};
