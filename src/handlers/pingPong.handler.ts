import {ChatInputCommandInteraction, MessageFlags} from "discord.js";
import redisService, {REDIS_KEYS} from "../services/redis.service.js";
import userService from "../services/user.service.js";

// Key-Strings bewusst identisch zum bisherigen Verhalten gehalten (nur die Struktur
// folgt jetzt der KEYS-Objekt-Konvention) - eine Änderung des Formats würde alle
// bereits in Redis gespeicherten Ping-Pong-Scores verwaisen lassen.
const KEYS = {
    score: (userId: string) => userId + REDIS_KEYS.PING_PONG,
    highscore: REDIS_KEYS.PING_PONG,
};

class PingPongHandler {

    async handlePingPong(interaction: ChatInputCommandInteraction) {
        try {
            const score: number = await this.getScore(interaction);
            if (Math.random() < 0.5) {
                const updatedScore = await this.updateScore(interaction.user.id, score + 1);
                return interaction.reply("Du hast einen Punkt gemacht! Du hast aktuell " + updatedScore + " Punkte!");
            }
            return interaction.reply("Das war leider nichts! Du bleibst bei " + score + " Punkten!");
        } catch (error) {
            console.error("Error handling ping pong:", error);
            return interaction.reply({ content: "Es gab einen Fehler beim Ausführen des Befehls.", flags: MessageFlags.Ephemeral });
        }
    }

    async getScore(message: ChatInputCommandInteraction): Promise<number> {
        const score = await redisService.get(KEYS.score(message.user.id));
        console.log("Retrieved score for user", message.user.id, "to", score);

        if (!score) {
            return await this.updateScore(message.user.id, 0);
        }
        return this.convertScoreToNumber(score);
    }

    async updateScore(userId: string, score: number): Promise<number> {
        const newScore: number = this.convertScoreToNumber(await redisService.set(KEYS.score(userId), score.toString()))
        await this.setHighscore(userId, newScore);
        return newScore;
    }

    convertScoreToNumber(score: string | number): number {
        if (!score || isNaN(Number(score))) {
            return 0;
        }
        return Number(score);
    }

    async setHighscore(userId: string, newScore: number) {
        await redisService.setSortedSet(KEYS.highscore, userId, newScore)
    }

    async handlePingPongHighscore(interaction: ChatInputCommandInteraction) {
        try {
            const highscore = await redisService.getSortedSet(KEYS.highscore);

            if (highscore.length === 0) {
                return interaction.reply("Es gibt noch keine Highscores!");
            }

            const users = await Promise.all(
                highscore.map(item => userService.getUser(item.value))
            );

            const message = highscore
                .map((item, index) => {
                    const user = users[index];
                    const displayName = user?.displayName ?? item.value;
                    return `${index + 1}. ${displayName} - ${item.score}`;
                })
                .join('\n');

            return interaction.reply(message);
        } catch (error) {
            console.error("Error handling ping pong highscore:", error);
            return interaction.reply({ content: "Es gab einen Fehler beim Abrufen der Highscores.", flags: MessageFlags.Ephemeral });
        }
    }
}

export default new PingPongHandler();