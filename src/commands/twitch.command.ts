import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import twitchHandler from "../handlers/twitch.handler.js";


export default {
    data: new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Twitch-Verknüpfung verwalten')
        .addSubcommand(sub => sub
            .setName('verknuepfen')
            .setDescription('Deinen Twitch-Kanal hinterlegen')
            .addStringOption(option => option
                .setName('benutzername')
                .setDescription('Dein Twitch-Benutzername')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('entfernen')
            .setDescription('Deine Twitch-Verknüpfung entfernen'))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Deine aktuelle Twitch-Verknüpfung anzeigen'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Twitch-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'verknuepfen':
                return twitchHandler.handleVerknuepfen(interaction);
            case 'entfernen':
                return twitchHandler.handleEntfernen(interaction);
            case 'status':
                return twitchHandler.handleStatus(interaction);
            case 'hilfe':
                return twitchHandler.handleHilfe(interaction);
        }
    }
};
