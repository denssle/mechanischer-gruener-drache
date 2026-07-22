import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import diagnoseHandler from '../handlers/diagnose.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('diagnose')
        .setDescription('Prüft alle setzbaren Kanäle/Einstellungen und die Twitch-Subscriptions (nur Admins)'),

    async execute(interaction: ChatInputCommandInteraction) {
        await diagnoseHandler.handleDiagnose(interaction);
    }
};
