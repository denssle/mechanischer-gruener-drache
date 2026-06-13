import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import pjson from '../../package.json' with {type: 'json'};

export default {
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Zeigt die aktuelle Version'),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply(
            `Aktuelle Version: ${pjson.version}`
        );
    }
};