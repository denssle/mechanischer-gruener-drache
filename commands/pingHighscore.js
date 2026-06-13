import {SlashCommandBuilder} from 'discord.js';
import pingPongHandler from "../handlers/pingPong.handler.js";

export default {
    data: new SlashCommandBuilder()
        .setName('pinghighscore')
        .setDescription('Zeigt die Ping Pong Highscore'),

    async execute(interaction) {
        await pingPongHandler.handlePingPongHighscore(
            interaction
        );
    }
};