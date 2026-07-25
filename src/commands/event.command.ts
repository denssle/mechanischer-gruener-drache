import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import eventHandler from '../handlers/event.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Community-Event: Termin setzen und Countdown abfragen')
        .addSubcommand(sub => sub
            .setName('countdown')
            .setDescription('Zeigt, wie lange es noch bis zum Event dauert'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Event-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'countdown':
                return eventHandler.handleCountdown(interaction);
            case 'hilfe':
                return eventHandler.handleHilfe(interaction);
        }
    }
};
