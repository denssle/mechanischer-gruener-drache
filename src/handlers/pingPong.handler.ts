import {ChatInputCommandInteraction} from "discord.js";
import redisService from "../services/redis.service.js";
import userService from "../services/user.service.js";


class PingPongHandler {
    #PING_PONG_KEY = "PING_PONG";

    async handlePingPong(interaction: ChatInputCommandInteraction) {
        const score: number = await this.getScore(interaction);
        if (Date.now() % 2 === 0) {
            const newVar = await this.updateScore(interaction.user.id, score + 1);
            return interaction.reply("Du hast einen Punkt gemacht! Du hast aktuell " + newVar + " Punkte!");
        }
        return interaction.reply("Das war leider nichts! Du bleibst bei " + score + " Punkten!");
    }

    async getScore(message: ChatInputCommandInteraction): Promise<number> {
        const score = await redisService.get(this.generatePingPongKey(message.user.id));
        console.log("Retrieved score for user", message.user.id, "to", score);

        if (!score) {
            return await this.updateScore(message.user.id, 0);
        }
        return this.convertScoreToNumber(score);
    }

    async updateScore(userId: string, score: number): Promise<number> {
        console.log("Updating score for user", userId, "to", score);
        const newScore: number = this.convertScoreToNumber(await redisService.set(this.generatePingPongKey(userId), score.toString()))
        this.setHighscore(userId, newScore);
        return newScore;
    }

    convertScoreToNumber(score: string | number): number {
        console.log("Converting score to number:", score);

        if (!score || isNaN(<number>score)) {
            return 0;
        }
        return Number(score);
    }

    generatePingPongKey(userId: string): string {
        return userId + this.#PING_PONG_KEY;
    }

    setHighscore(userId: string, newScore: number) {
        console.log("Setting highscore for user", userId, "to", newScore);
        redisService.setSortedSet(this.#PING_PONG_KEY, userId, newScore)
    }

    async handlePingPongHighscore(interaction: ChatInputCommandInteraction) {
        const highscore = await redisService.getSortedSet(this.#PING_PONG_KEY);
        console.log("Retrieved highscore for user", interaction.user.tag, "to", highscore)
        const sorted = highscore.sort((a, b) => b.score - a.score);

        const users = await Promise.all(
            sorted.map(item => userService.getUser(item.value))
        );

        const message = sorted
            .map((item, index) => {
                const user = users[index];
                const displayName = user?.displayName ?? item.value;
                return `${index + 1}. ${displayName} - ${item.score}`;
            })
            .join('\n');

        return interaction.reply(message);
    }
}

export default new PingPongHandler();