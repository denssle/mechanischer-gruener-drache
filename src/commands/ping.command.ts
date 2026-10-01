import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import pingPongHandler from "../handlers/pingPong.handler.js";
import pingPongSeasonHandler from "../handlers/pingPongSeason.handler.js";

export default {
    data: new SlashCommandBuilder()
        .setName('pingpong')
        .setDescription('Ping Pong: Duelle gegen andere, Bestenliste der laufenden Season, Ruhmeshalle')
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
            .setName('rundlauf')
            .setDescription('Rundlauf (Chinesisch) fuer mehrere: wer den Ball nicht zurueckbringt, fliegt raus'))
        .addSubcommand(sub => sub
            .setName('doppel')
            .setDescription('Doppel zu viert: mit Partner feste Teams, ohne Partner lost der Bot die Teams aus')
            .addUserOption(option => option
                .setName('partner')
                .setDescription('Dein fester Partner – leer lassen für ausgeloste Teams')
                .setRequired(false))
            .addUserOption(option => option
                .setName('gegner1')
                .setDescription('Optional: ein Gegner (nur mit Partner), sonst tritt jemand per Button bei')
                .setRequired(false))
            .addUserOption(option => option
                .setName('gegner2')
                .setDescription('Optional: der zweite Gegner (nur mit Partner)')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('bestenliste')
            .setDescription('Zeigt die Ping-Pong-Bestenliste'))
        .addSubcommand(sub => sub
            .setName('ruhmeshalle')
            .setDescription('Zeigt die Champions der vergangenen Seasons'))
        .addSubcommand(sub => sub
            .setName('serienrekorde')
            .setDescription('Zeigt die laengsten je erreichten Siegesserien'))
        .addSubcommand(sub => sub
            .setName('pechstraehnen')
            .setDescription('Zeigt die laengsten je erlittenen Niederlagenserien'))
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
            case 'rundlauf':
                return pingPongHandler.handleRundlauf(interaction);
            case 'doppel':
                return pingPongHandler.handleDoppel(interaction);
            case 'bestenliste':
                return pingPongHandler.handlePingPongHighscore(interaction);
            case 'ruhmeshalle':
                return pingPongSeasonHandler.handleRuhmeshalle(interaction);
            case 'serienrekorde':
                return pingPongHandler.handleSerienrekorde(interaction);
            case 'pechstraehnen':
                return pingPongHandler.handlePechstraehnen(interaction);
            case 'hilfe':
                return pingPongHandler.handleHilfe(interaction);
        }
    }
};
