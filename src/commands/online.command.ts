import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import onlineHandler from '../handlers/online.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('online')
        .setDescription('Zeigt, wer gerade im Spiel (lotgd.de) eingeloggt ist'),

    async execute(interaction: ChatInputCommandInteraction) {
        await onlineHandler.handleOnline(interaction);
    }
};
