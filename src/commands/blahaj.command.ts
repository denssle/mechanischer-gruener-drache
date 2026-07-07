import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import blahajHandler from '../handlers/blahaj.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('blahaj')
        .setDescription('Rechnet Euro-Beträge in Blåhajs (und bedeckte Fläche) um')
        .addNumberOption(option => option
            .setName('betrag')
            .setDescription('Optionaler Euro-Betrag zum Umrechnen; ohne Angabe die Server-Gesamtsumme')
            .setRequired(false)
            .setMinValue(0)),

    async execute(interaction: ChatInputCommandInteraction) {
        return blahajHandler.handleBlahaj(interaction);
    }
};
