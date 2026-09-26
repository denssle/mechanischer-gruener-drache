import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import campHandler from '../handlers/camp.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('camp')
        .setDescription('Fortschritt des gemeinsamen Camps')
        .addSubcommand(sub => sub
            .setName('ressourcen')
            .setDescription('Zeigt die aktuellen Camp-Ressourcen'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt die Hilfe zum Camp'))
        .addSubcommand(sub => sub
            .setName('starten')
            .setDescription('Startet das Camp und die Ressourcensammlung')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'ressourcen':
                return campHandler.handleRessourcen(interaction);
            case 'hilfe':
                return campHandler.handleHilfe(interaction);
            case 'starten':
                return campHandler.handleStarten(interaction);
        }
    }
};
