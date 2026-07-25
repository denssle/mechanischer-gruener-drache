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
            .setDescription('Deinen letzten Eintrag löschen'))
        .addSubcommand(sub => sub
            .setName('bearbeiten')
            .setDescription('Kilometer deines letzten Eintrags korrigieren')
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
            .setName('gesamt')
            .setDescription('Gesamtkilometer aller Sportler'))
        .addSubcommandGroup(group => group
            .setName('meilenstein')
            .setDescription('Meilensteine für die gemeinsame Gesamtdistanz')
            .addSubcommand(sub => sub
                .setName('setzen')
                .setDescription('Meilenstein mit Kilometerzahl und Ankündigungstext anlegen')
                .addNumberOption(option => option
                    .setName('kilometer')
                    .setDescription('Ab welcher Gesamtdistanz gefeiert wird')
                    .setRequired(true)
                    .setMinValue(1))
                .addStringOption(option => option
                    .setName('text')
                    .setDescription('Ankündigungstext (Markdown erlaubt, \\n für Zeilenumbruch)')
                    .setRequired(true)))),

    async execute(interaction: ChatInputCommandInteraction) {
        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        if (group === 'meilenstein') {
            switch (subcommand) {
                case 'setzen':
                    return sportHandler.handleMeilensteinSetzen(interaction);
            }
            return;
        }

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
            case 'gesamt':
                return sportHandler.handleGesamt(interaction);
        }
    }
};
