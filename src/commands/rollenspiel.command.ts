import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import rpHandler from '../handlers/rp.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rollenspiel')
        .setDescription('Roleplay-Suche: melde dich als suchend und finde Mitspieler')
        .addSubcommand(sub => sub
            .setName('suche')
            .setDescription('Melde dich als RP-suchend')
            .addStringOption(option => option
                .setName('art')
                .setDescription('Welche Art von Roleplay suchst du?')
                .setRequired(true)
                .addChoices(
                    {name: 'PbP (play-by-post)', value: 'pbp'},
                    {name: 'Live', value: 'live'},
                    {name: 'Beides', value: 'beides'},
                )))
        .addSubcommand(sub => sub
            .setName('suchende')
            .setDescription('Zeigt alle, die gerade Roleplay suchen'))
        .addSubcommand(sub => sub
            .setName('beenden')
            .setDescription('Nimmt dich wieder von der Suchliste'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Roleplay-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'suche':
                return rpHandler.handleSuche(interaction);
            case 'suchende':
                return rpHandler.handleSuchende(interaction);
            case 'beenden':
                return rpHandler.handleBeenden(interaction);
            case 'hilfe':
                return rpHandler.handleHilfe(interaction);
        }
    }
};
