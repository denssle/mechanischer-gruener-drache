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
            .setDescription('Duell mit angesagtem Sieg: gewinnst du, gibt es einen Punkt extra – verlierst du, kostet es einen')
            .addUserOption(option => option
                .setName('gegner')
                .setDescription('Wen möchtest du herausfordern?')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('taktikduell')
            .setDescription('Duell mit verdeckter Aktion: Schmetterball schlaegt Lupfer schlaegt Konter schlaegt Schmetterball')
            .addUserOption(option => option
                .setName('gegner')
                .setDescription('Wen möchtest du herausfordern?')
                .setRequired(true))
            .addStringOption(option => option
                .setName('aktion')
                .setDescription('Deine verdeckte Aktion – der Gegner sieht sie erst im Ergebnis')
                .setRequired(true)
                .addChoices(
                    {name: 'Schmetterball (schlägt Lupfer)', value: 'schmetterball'},
                    {name: 'Konter (schlägt Schmetterball)', value: 'konter'},
                    {name: 'Lupfer (schlägt Konter)', value: 'lupfer'},
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
            case 'taktikduell':
                return pingPongHandler.handleTaktikduell(interaction);
            case 'bestenliste':
                return pingPongHandler.handlePingPongHighscore(interaction);
            case 'hilfe':
                return pingPongHandler.handleHilfe(interaction);
        }
    }
};
