import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import spielweltHandler from '../handlers/spielwelt.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('spielwelt')
        .setDescription('Erklärt die Spiel-Daten-Befehle: /news, /ereignisse und /online'),

    async execute(interaction: ChatInputCommandInteraction) {
        await spielweltHandler.handleSpielwelt(interaction);
    }
};
