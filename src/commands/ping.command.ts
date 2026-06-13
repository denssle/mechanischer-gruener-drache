import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import pingPongHandler from "../handlers/pingPong.handler.js";

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Spielt Ping Pong'),

    async execute(interaction: ChatInputCommandInteraction) {
        await pingPongHandler.handlePingPong(interaction);
    }
};
