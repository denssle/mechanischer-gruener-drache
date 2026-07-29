import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import geburtstagHandler, {FRUEHESTES_JAHR} from '../handlers/geburtstag.handler.js';

// Monate als Choices statt Freitext: eine Auswahl kann keinen "13" enthalten, und der Name macht
// beim Eintragen sofort klar, was gemeint ist (5/6 vs. Mai/Juni).
const MONATE = [
    {name: 'Januar', value: 1},
    {name: 'Februar', value: 2},
    {name: 'März', value: 3},
    {name: 'April', value: 4},
    {name: 'Mai', value: 5},
    {name: 'Juni', value: 6},
    {name: 'Juli', value: 7},
    {name: 'August', value: 8},
    {name: 'September', value: 9},
    {name: 'Oktober', value: 10},
    {name: 'November', value: 11},
    {name: 'Dezember', value: 12},
];

export default {
    data: new SlashCommandBuilder()
        .setName('geburtstag')
        .setDescription('Geburtstagskalender: Geburtstag hinterlegen und gratuliert bekommen')
        .addSubcommand(sub => sub
            .setName('setzen')
            .setDescription('Hinterlege deinen Geburtstag (Jahr ist freiwillig)')
            .addIntegerOption(option => option
                .setName('tag')
                .setDescription('Tag im Monat (1-31)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(31))
            .addIntegerOption(option => option
                .setName('monat')
                .setDescription('Monat')
                .setRequired(true)
                .addChoices(...MONATE))
            .addIntegerOption(option => option
                .setName('jahr')
                .setDescription('Geburtsjahr (optional – nur dann nenne ich beim Gratulieren dein Alter)')
                .setRequired(false)
                .setMinValue(FRUEHESTES_JAHR)
                .setMaxValue(new Date().getFullYear())))
        .addSubcommand(sub => sub
            .setName('entfernen')
            .setDescription('Löscht deinen Geburtstags-Eintrag'))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Zeigt, welchen Geburtstag ich zu dir gespeichert habe'))
        .addSubcommand(sub => sub
            .setName('liste')
            .setDescription('Zeigt die nächsten anstehenden Geburtstage'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Geburtstags-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'setzen':
                return geburtstagHandler.handleSetzen(interaction);
            case 'entfernen':
                return geburtstagHandler.handleEntfernen(interaction);
            case 'status':
                return geburtstagHandler.handleStatus(interaction);
            case 'liste':
                return geburtstagHandler.handleListe(interaction);
            case 'hilfe':
                return geburtstagHandler.handleHilfe(interaction);
        }
    }
};
