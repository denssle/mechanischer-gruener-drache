import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import eventHandler from '../handlers/event.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Community-Event: Termin setzen und Countdown abfragen')
        .addSubcommand(sub => sub
            .setName('setzen')
            .setDescription('Termin für das Community-Event festlegen (nur Admins)')
            .addStringOption(option => option
                .setName('datum')
                .setDescription('Datum im Format TT.MM.JJJJ (z.B. 24.12.2026)')
                .setRequired(true))
            .addStringOption(option => option
                .setName('uhrzeit')
                .setDescription('Optionale Uhrzeit im Format HH:MM (z.B. 18:30)')
                .setRequired(false))
            .addStringOption(option => option
                .setName('titel')
                .setDescription('Optionaler Name des Events')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('countdown')
            .setDescription('Zeigt, wie lange es noch bis zum Event dauert'))
        .addSubcommand(sub => sub
            .setName('entfernen')
            .setDescription('Das gesetzte Event wieder entfernen (nur Admins)'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Event-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'setzen':
                return eventHandler.handleSetzen(interaction);
            case 'countdown':
                return eventHandler.handleCountdown(interaction);
            case 'entfernen':
                return eventHandler.handleEntfernen(interaction);
            case 'hilfe':
                return eventHandler.handleHilfe(interaction);
        }
    }
};
