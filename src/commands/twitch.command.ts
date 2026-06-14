import {ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
import twitchHandler from "../handlers/twitch.handler.js";


export default {
    data: new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Twitch-Verknüpfung verwalten')
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Deinen Twitch-Channel hinterlegen')
            .addStringOption(option => option
                .setName('channel')
                .setDescription('Dein Twitch-Benutzername')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Deine Twitch-Verknüpfung entfernen'))
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('Deine aktuelle Twitch-Verknüpfung anzeigen'))
        .addSubcommand(sub => sub
            .setName('notification-channel')
            .setDescription('Discord-Channel für Twitch-Notifications festlegen (nur Admins)')
            .addChannelOption((option) => option
                .setName('channel')
                .setDescription('Discord-Channel für Notifications')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Twitch-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                return twitchHandler.handleSet(interaction);
            case 'remove':
                return twitchHandler.handleRemove(interaction);
            case 'info':
                return twitchHandler.handleInfo(interaction);
            case 'notification-channel':
                return twitchHandler.handleNotificationChannel(interaction);
            case 'hilfe':
                return twitchHandler.handleHilfe(interaction);
        }
    }
};
