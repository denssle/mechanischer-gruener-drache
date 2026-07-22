import {ChannelType, ChatInputCommandInteraction, SlashCommandBuilder} from "discord.js";
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
            .setName('benachrichtigungskanal')
            .setDescription('Discord-Kanal für Twitch-Benachrichtigungen festlegen (nur Admins)')
            .addChannelOption((option) => option
                .setName('kanal')
                .setDescription('Discord-Kanal für Benachrichtigungen')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Twitch-Befehle'))
        .addSubcommand(sub => sub
            .setName('benachrichtigungsrolle')
            .setDescription('Rolle die bei Twitch-Benachrichtigungen gepingt wird (nur Admins)')
            .addRoleOption(option => option
                .setName('rolle')
                .setDescription('Zu pingende Rolle')
                .setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'verknuepfen':
                return twitchHandler.handleVerknuepfen(interaction);
            case 'entfernen':
                return twitchHandler.handleEntfernen(interaction);
            case 'status':
                return twitchHandler.handleStatus(interaction);
            case 'benachrichtigungskanal':
                return twitchHandler.handleBenachrichtigungskanal(interaction);
            case 'hilfe':
                return twitchHandler.handleHilfe(interaction);
            case 'benachrichtigungsrolle':
                return twitchHandler.handleBenachrichtigungsrolle(interaction);
        }
    }
};
