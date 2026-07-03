import {ChannelType, ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import loggingHandler from '../handlers/logging.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('log')
        .setDescription('Legt den Channel für bearbeitete/gelöschte Nachrichten fest (nur Admins)')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Ziel-Channel für Log-Nachrichten')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction) {
        await loggingHandler.handleSetChannel(interaction);
    }
};
