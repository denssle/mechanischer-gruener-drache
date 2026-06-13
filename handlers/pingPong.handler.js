import redisService from "../services/redis.service.js";


class PingPongHandler {
    #PING_PONG_KEY = "PING_PONG";

    async handlePingPong(message) {
        let score = await this.getScore(message);
        if (Date.now() % 2 === 0) {
            const newVar = await this.updateScore(message.author.id, score + 1, message.author.tag);
            return message.reply("Du hast einen Punkt gemacht! Du hast aktuell " + newVar + " Punkte!");
        }
        return message.reply("Das war leider nichts! Du bleibst bei " + score + " Punkten!");
    }

    async getScore(message) {
        let score = await redisService.get(this.generatePingPongKey(message.author.id));
        console.log("Retrieved score for user", message.author.id, "to", score);

        if (!score) {
            return await this.updateScore(message.author.id, 0, message.author.tag);
        }
        return this.convertScoreToNumber(score);
    }

    async updateScore(userId, score, usertag) {
        console.log("Updating score for user", userId, "to", score);
        const newScore = this.convertScoreToNumber(await redisService.set(this.generatePingPongKey(userId), score))
        this.setHighscore(usertag, newScore, usertag);
        return newScore;
    }

    convertScoreToNumber(score) {
        console.log("Converting score to number:", score);

        if (!score || isNaN(score)) {
            return 0;
        }
        return Number(score);
    }

    generatePingPongKey(userId) {
        return userId + this.#PING_PONG_KEY;
    }

    setHighscore(usertag, newScore) {
        console.log("Setting highscore for user", usertag, "to", newScore);
        redisService.setSortedSet(this.#PING_PONG_KEY, usertag, newScore)
    }

    async handlePingPongHighscore(message) {
        const highscore = await redisService.getSortedSet(this.#PING_PONG_KEY);
        console.log("Retrieved highscore for user", message.author.tag, "to", highscore)
        return message.reply(highscore
            .sort((a, b) => b.score - a.score)
            .map((item, index) => `- ${index + 1}. ${item.value} - ${item.score}`)
            .join('\n'));
    }
}

export default new PingPongHandler();