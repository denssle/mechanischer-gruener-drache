import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import pingPongHandler from "../handlers/pingPong.handler.js";

export default {
    data: new SlashCommandBuilder()
        .setName('pingpong')
        .setDescription('Ping Pong: jemanden zum Duell herausfordern, Bestenliste')
        .addSubcommand(sub => sub
            .setName('herausfordern')
            .setDescription('Fordert eine andere Person zu einem Ping-Pong-Duell heraus')
            .addUserOption(option => option
                .setName('gegner')
                .setDescription('Wen möchtest du herausfordern?')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('ansageduell')
            .setDescription('Duell mit Ansage: sagst du den Ausgang richtig voraus, gibt es einen Extra-Punkt')
            .addUserOption(option => option
                .setName('gegner')
                .setDescription('Wen möchtest du herausfordern?')
                .setRequired(true))
            .addStringOption(option => option
                .setName('ansage')
                .setDescription('Wie geht das Duell für dich aus?')
                .setRequired(true)
                .addChoices(
                    {name: 'Ich gewinne', value: 'sieg'},
                    {name: 'Ich verliere', value: 'niederlage'},
                )))
        .addSubcommand(sub => sub
            .setName('bestenliste')
            .setDescription('Zeigt die Ping-Pong-Bestenliste'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Ping-Pong-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'herausfordern':
                return pingPongHandler.handleHerausfordern(interaction);
            case 'ansageduell':
                return pingPongHandler.handleAnsageduell(interaction);
            case 'bestenliste':
                return pingPongHandler.handlePingPongHighscore(interaction);
            case 'hilfe':
                return pingPongHandler.handleHilfe(interaction);
        }
    }
};
