import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import reactionRoleHandler from '../handlers/reactionRole.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rolle')
        .setDescription('Reaction-Roles verwalten (nur Admins)')
        .addSubcommand(sub => sub
            .setName('hinzufuegen')
            .setDescription('Reaktion mit einem Emoji auf eine Nachricht vergibt eine Rolle')
            .addStringOption(option => option
                .setName('message-id')
                .setDescription('ID der Nachricht (im selben Channel wie dieser Befehl, Rechtsklick → ID kopieren)')
                .setRequired(true))
            .addStringOption(option => option
                .setName('emoji')
                .setDescription('Emoji, auf das reagiert werden soll')
                .setRequired(true))
            .addRoleOption(option => option
                .setName('rolle')
                .setDescription('Rolle, die bei Reaktion vergeben wird')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('entfernen')
            .setDescription('Eine Reaction-Role-Verknüpfung wieder entfernen')
            .addStringOption(option => option
                .setName('message-id')
                .setDescription('ID der Nachricht')
                .setRequired(true))
            .addStringOption(option => option
                .setName('emoji')
                .setDescription('Emoji der Verknüpfung')
                .setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'hinzufuegen':
                return reactionRoleHandler.handleAdd(interaction);
            case 'entfernen':
                return reactionRoleHandler.handleRemove(interaction);
        }
    }
};
