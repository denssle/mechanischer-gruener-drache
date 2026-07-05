import {ChatInputCommandInteraction, MessageFlags} from "discord.js";
import redisService, {REDIS_KEYS} from "../services/redis.service.js";
import userService from "../services/user.service.js";

// Key-Strings bewusst identisch zum bisherigen Verhalten gehalten (nur die Struktur
// folgt jetzt der KEYS-Objekt-Konvention) - eine Änderung des Formats würde alle
// bereits in Redis gespeicherten Ping-Pong-Scores verwaisen lassen.
// Nach jedem Spiel darf man erst nach Ablauf dieser Zeit wieder spielen - verhindert
// stumpfes Spammen des Befehls (die Bestenliste soll nicht reine Klick-Menge belohnen).
const COOLDOWN_SECONDS = 30;

const KEYS = {
    score: (userId: string) => userId + REDIS_KEYS.PING_PONG,
    highscore: REDIS_KEYS.PING_PONG,
    cooldown: (userId: string) => `PING_PONG:COOLDOWN:${userId}`,
};

// Zufällige Flavor-Zeilen für Sieg/Niederlage - die eigentliche Punkte-Info hängt der Handler
// danach an. Exportiert + getestet, damit die Auswahl abgesichert ist.
export const WIN_FLAVORS = [
    '🏓 Ass! Der Ball zischt an der Kante vorbei.',
    '🏓 Sauberer Schmetterball – nicht zu halten!',
    '🏓 Netzroller! Frech, aber der zählt.',
    '🏓 Volltreffer, der Gegner guckt nur zu.',
    '🏓 Perfekter Return – Punkt für dich!',
    '🏓 Der Aufschlag sitzt!',
];

export const LOSS_FLAVORS = [
    '🏓 Ball ins Aus – knapp daneben. 😬',
    '🏓 Ins Netz gesetzt. Ärgerlich!',
    '🏓 Der Return war eine Nummer zu groß für dich.',
    '🏓 Aufschlag verpatzt.',
    '🏓 Am Tisch vorbei – das war nichts.',
    '🏓 Der Gegner kontert, du kommst nicht ran.',
];

export function randomWinFlavor(): string {
    return WIN_FLAVORS[Math.floor(Math.random() * WIN_FLAVORS.length)];
}

export function randomLossFlavor(): string {
    return LOSS_FLAVORS[Math.floor(Math.random() * LOSS_FLAVORS.length)];
}

class PingPongHandler {

    async handlePingPong(interaction: ChatInputCommandInteraction) {
        try {
            const userId = interaction.user.id;

            const remaining = await redisService.getTimeToLive(KEYS.cooldown(userId));
            if (remaining > 0) {
                return interaction.reply({
                    content: `🏓 Kurz durchatmen – du kannst in **${remaining}s** wieder aufschlagen.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            await redisService.setWithExpiry(KEYS.cooldown(userId), '1', COOLDOWN_SECONDS);

            const score: number = await this.getScore(interaction);
            if (Math.random() < 0.5) {
                const updatedScore = await this.updateScore(userId, score + 1);
                return interaction.reply(`${randomWinFlavor()}\nDu hast jetzt **${updatedScore}** Punkte!`);
            }
            return interaction.reply(`${randomLossFlavor()}\nDu bleibst bei **${score}** Punkten!`);
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