import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import pingPongHandler from "../handlers/pingPong.handler.js";

export default {
    data: new SlashCommandBuilder()
        .setName('pingbestenliste')
        .setDescription('Zeigt die Ping-Pong-Bestenliste'),

    async execute(interaction: ChatInputCommandInteraction) {
        await pingPongHandler.handlePingPongHighscore(interaction);
    }
};