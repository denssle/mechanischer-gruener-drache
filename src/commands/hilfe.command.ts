import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import hilfeHandler from '../handlers/hilfe.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('hilfe')
        .setDescription('Zeigt eine Übersicht aller Befehle des Bots'),

    async execute(interaction: ChatInputCommandInteraction) {
        await hilfeHandler.handleHilfe(interaction);
    }
};
