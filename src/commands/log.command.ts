import {ChannelType, ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import loggingHandler from '../handlers/logging.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('protokoll')
        .setDescription('Legt den Kanal für bearbeitete/gelöschte Nachrichten fest (nur Admins)')
        .addChannelOption(option => option
            .setName('kanal')
            .setDescription('Ziel-Kanal für Protokoll-Nachrichten')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction) {
        await loggingHandler.handleSetChannel(interaction);
    }
};
