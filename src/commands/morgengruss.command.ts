import {ChannelType, ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import greetingHandler from '../handlers/greeting.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('morgengruss')
        .setDescription('Morgengruß-Tradition: erste Nachricht des Tages begrüßen (nur Admins)')
        .addSubcommand(sub => sub
            .setName('kanal')
            .setDescription('Kanal für den täglichen Morgengruß festlegen')
            .addChannelOption(option => option
                .setName('kanal')
                .setDescription('Kanal für den täglichen Morgengruß')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('lernen')
            .setDescription('Persönliche Emojis aus der bisherigen Chat-Historie auffrischen')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'kanal':
                return greetingHandler.handleSetChannel(interaction);
            case 'lernen':
                return greetingHandler.handleLernen(interaction);
        }
    }
};
