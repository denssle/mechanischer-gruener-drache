import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import sportHandler from '../handlers/sport.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sport')
        .setDescription('Sportliche Aktivitäten tracken')
        .addSubcommand(sub => sub
            .setName('eintragen')
            .setDescription('Neue sportliche Aktivität eintragen')
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
            .setName('statistik')
            .setDescription('Deine persönliche Sportstatistik'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Sport-Befehle'))
        .addSubcommand(sub => sub
            .setName('setzen')
            .setDescription('Kilometer eines Mitglieds manuell setzen (nur Admins)')
            .addUserOption(option => option
                .setName('mitglied')
                .setDescription('Discord-Mitglied')
                .setRequired(true))
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Kilometerstand der gesetzt werden soll')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('gesamt')
            .setDescription('Gesamtkilometer aller Sportler'))
        .addSubcommand(sub => sub
            .setName('altkilometer')
            .setDescription('Altkilometer ohne zugeordnetes Mitglied einspeisen (nur Admins)')
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Anzahl der Kilometer')
                .setRequired(true)
                .setMinValue(0))),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'eintragen':
                return sportHandler.handleEintragen(interaction);
            case 'loeschen':
                return sportHandler.handleLoeschen(interaction);
            case 'bearbeiten':
                return sportHandler.handleBearbeiten(interaction);
            case 'statistik':
                return sportHandler.handleStatistik(interaction);
            case 'hilfe':
                return sportHandler.handleHilfe(interaction);
            case 'setzen':
                return sportHandler.handleSetzen(interaction);
            case 'gesamt':
                return sportHandler.handleGesamt(interaction);
            case 'altkilometer':
                return sportHandler.handleAltkilometer(interaction);
        }
    }
};
