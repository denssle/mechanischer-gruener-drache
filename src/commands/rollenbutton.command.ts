import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import buttonRoleHandler from '../handlers/buttonRole.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rollenbutton')
        .setDescription('Postet eine Nachricht mit einem Button, über den sich User eine Rolle geben/nehmen (nur Admins)')
        .addStringOption(option => option
            .setName('text')
            .setDescription('Text der Nachricht über dem Button')
            .setRequired(true))
        .addRoleOption(option => option
            .setName('rolle')
            .setDescription('Rolle, die der Button vergibt')
            .setRequired(true))
        .addStringOption(option => option
            .setName('beschriftung')
            .setDescription('Beschriftung des Buttons')
            .setRequired(true))
        .addStringOption(option => option
            .setName('emoji')
            .setDescription('Optionales Emoji auf dem Button')
            .setRequired(false)),

    async execute(interaction: ChatInputCommandInteraction) {
        await buttonRoleHandler.handleCreate(interaction);
    }
};
