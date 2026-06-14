import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import sportHandler from '../handlers/sport.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sport')
        .setDescription('Sport Tracking')
        .addSubcommand(sub => sub
            .setName('hinzufuegen')
            .setDescription('Sport Eintrag hinzufügen')
            .addStringOption(option => option
                .setName('aktivitaet')
                .setDescription('Art der Aktivität')
                .setRequired(true)
                .addChoices(
                    {name: '🏃 Laufen', value: 'laufen'},
                    {name: '🚴 Radfahren', value: 'radfahren'},
                    {name: '🏊 Schwimmen', value: 'schwimmen'},
                    {name: '🚶 Wandern', value: 'wandern'},
                    {name: '⛷️ Skifahren', value: 'skifahren'},
                ))
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Anzahl der Kilometer')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('loeschen')
            .setDescription('Sport Eintrag löschen')
            .addStringOption(option => option
                .setName('eintrag-id')
                .setDescription('ID des Eintrags')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('bearbeiten')
            .setDescription('Sport Eintrag bearbeiten')
            .addStringOption(option => option
                .setName('eintrag-id')
                .setDescription('ID des Eintrags')
                .setRequired(true))
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Neue Kilometeranzahl')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('bestenliste')
            .setDescription('Top 10 der fleißigsten Sportler'))
        .addSubcommand(sub => sub
            .setName('statistik')
            .setDescription('Deine persönliche Sportstatistik'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Sport-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'hinzufuegen':
                return sportHandler.handleHinzufuegen(interaction);
            case 'loeschen':
                return sportHandler.handleLoeschen(interaction);
            case 'bearbeiten':
                return sportHandler.handleBearbeiten(interaction);
            case 'bestenliste':
                return sportHandler.handleBestenliste(interaction);
            case 'statistik':
                return sportHandler.handleStatistik(interaction);
            case 'hilfe':
                return sportHandler.handleHilfe(interaction);
        }
    }
};
