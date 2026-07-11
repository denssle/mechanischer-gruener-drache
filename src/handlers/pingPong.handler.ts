import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageFlags
} from "discord.js";
import redisService, {REDIS_KEYS} from "../services/redis.service.js";
import userService from "../services/user.service.js";

// Key-Strings bewusst identisch zum bisherigen Verhalten gehalten (nur die Struktur
// folgt jetzt der KEYS-Objekt-Konvention) - eine Änderung des Formats würde alle
// bereits in Redis gespeicherten Ping-Pong-Scores verwaisen lassen.
// Nach jeder Herausforderung darf man erst nach Ablauf dieser Zeit wieder aufschlagen -
// verhindert, dass jemand den halben Server in Serie herausfordert.
const COOLDOWN_SECONDS = 30;

// Duell: gespielt wird auf POINTS_TO_WIN gewonnene Ballwechsel (je 50/50, wie das Solo-Spiel).
// Der Sieger bekommt einen Punkt für die Bestenliste, der Verlierer verliert einen - aber
// nie unter 0 (niemand soll ins Minus gespielt werden können).
const POINTS_TO_WIN = 3;
const DUELL_WIN = 1;
const DUELL_LOSS = 1;

// Herausforderer- und Gegner-ID stecken direkt in der customId (wie bei den Button-Rollen)
// - dadurch braucht das Duell keinen Redis-State und überlebt einen Bot-Neustart.
// Doppeltes Annehmen verhindert das Entfernen der Buttons beim ersten Klick.
const DUELL_PREFIX = 'pingpong-duell:';

const KEYS = {
    score: (userId: string) => userId + REDIS_KEYS.PING_PONG,
    highscore: REDIS_KEYS.PING_PONG,
    cooldown: (userId: string) => `PING_PONG:COOLDOWN:${userId}`,
};

// Abschluss-Zeilen fürs Duell, aus Sicht des Siegers formuliert (der Handler setzt die Namen davor).
// Exportiert + getestet, damit die Auswahl abgesichert ist.
export const DUELL_FLAVORS = [
    'Der letzte Ball landet unerreichbar in der Ecke.',
    'Ein Schmetterball zum Schluss – Spiel, Satz, Sieg.',
    'Der entscheidende Aufschlag sitzt.',
    'Der Ballwechsel zieht sich, dann fällt der Punkt.',
    'Ein Netzroller entscheidet das Match.',
];

export function randomDuellFlavor(): string {
    return DUELL_FLAVORS[Math.floor(Math.random() * DUELL_FLAVORS.length)];
}

// Simuliert das Match: Ballwechsel für Ballwechsel 50/50, bis einer POINTS_TO_WIN erreicht.
// Exportiert + getestet - die Punktevergabe hängt daran.
export function spieleDuell(): { herausfordererPunkte: number; gegnerPunkte: number } {
    let herausfordererPunkte = 0;
    let gegnerPunkte = 0;

    while (herausfordererPunkte < POINTS_TO_WIN && gegnerPunkte < POINTS_TO_WIN) {
        if (Math.random() < 0.5) {
            herausfordererPunkte++;
        } else {
            gegnerPunkte++;
        }
    }

    return {herausfordererPunkte, gegnerPunkte};
}

class PingPongHandler {

    async handleHerausfordern(interaction: ChatInputCommandInteraction) {
        try {
            const herausforderer = interaction.user;
            const gegner = interaction.options.getUser('gegner', true);

            if (gegner.id === herausforderer.id) {
                return interaction.reply({
                    content: 'Gegen dich selbst zu spielen ist auf Dauer langweilig. Such dir jemanden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (gegner.bot) {
                return interaction.reply({
                    content: 'Bots haben keine Hände. Fordere jemanden aus Fleisch und Blut heraus.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const remaining = await redisService.getTimeToLive(KEYS.cooldown(herausforderer.id));
            if (remaining > 0) {
                return interaction.reply({
                    content: `Kurz durchatmen – du kannst in **${remaining}s** wieder aufschlagen.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            await redisService.setWithExpiry(KEYS.cooldown(herausforderer.id), '1', COOLDOWN_SECONDS);

            const annehmen = new ButtonBuilder()
                .setCustomId(`${DUELL_PREFIX}annehmen:${herausforderer.id}:${gegner.id}`)
                .setLabel('Annehmen')
                .setStyle(ButtonStyle.Success);

            const ablehnen = new ButtonBuilder()
                .setCustomId(`${DUELL_PREFIX}ablehnen:${herausforderer.id}:${gegner.id}`)
                .setLabel('Ablehnen')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(annehmen, ablehnen);

            return interaction.reply({
                content: `<@${herausforderer.id}> fordert <@${gegner.id}> zu einem Ping-Pong-Duell heraus.\n`
                    + `Gespielt wird auf **${POINTS_TO_WIN}** gewonnene Ballwechsel. `
                    + `Der Sieg bringt **+${DUELL_WIN}** Punkt, die Niederlage kostet **${DUELL_LOSS}** (nie unter 0).`,
                components: [row]
            });
        } catch (error) {
            console.error('Fehler beim Erstellen der Ping-Pong-Herausforderung:', error);
            return interaction.reply({
                content: 'Es gab einen Fehler beim Ausführen des Befehls.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async handleDuellButton(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith(DUELL_PREFIX)) return;

        try {
            const [aktion, herausfordererId, gegnerId] = interaction.customId.slice(DUELL_PREFIX.length).split(':');

            // Nur der Herausgeforderte darf über die Herausforderung entscheiden.
            if (interaction.user.id !== gegnerId) {
                return interaction.reply({
                    content: 'Diese Herausforderung gilt nicht dir.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (aktion === 'ablehnen') {
                return interaction.update({
                    content: `<@${gegnerId}> lehnt die Herausforderung von <@${herausfordererId}> ab. Kein Duell heute.`,
                    components: []
                });
            }

            const {herausfordererPunkte, gegnerPunkte} = spieleDuell();
            const herausfordererGewinnt = herausfordererPunkte > gegnerPunkte;
            const siegerId = herausfordererGewinnt ? herausfordererId : gegnerId;
            const verliererId = herausfordererGewinnt ? gegnerId : herausfordererId;

            const siegerScore = await this.getScore(siegerId);
            const verliererScore = await this.getScore(verliererId);

            const neuerSiegerScore = await this.updateScore(siegerId, siegerScore + DUELL_WIN);
            const neuerVerliererScore = await this.updateScore(verliererId, Math.max(0, verliererScore - DUELL_LOSS));

            const satz = herausfordererGewinnt
                ? `${herausfordererPunkte}:${gegnerPunkte}`
                : `${gegnerPunkte}:${herausfordererPunkte}`;

            return interaction.update({
                content: `**<@${siegerId}> gewinnt ${satz} gegen <@${verliererId}>.**\n`
                    + `${randomDuellFlavor()}\n`
                    + `<@${siegerId}>: **${neuerSiegerScore}** Punkte · <@${verliererId}>: **${neuerVerliererScore}** Punkte`,
                components: []
            });
        } catch (error) {
            console.error('Fehler beim Austragen des Ping-Pong-Duells:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Das Duell konnte nicht ausgetragen werden.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }

    async getScore(userId: string): Promise<number> {
        const score = await redisService.get(KEYS.score(userId));
        console.log("Retrieved score for user", userId, "to", score);

        if (!score) {
            return await this.updateScore(userId, 0);
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

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Ping-Pong-Befehle**\n\n` +
            `**/pingpong herausfordern** – Duell gegen eine andere Person: sie nimmt per Button an, `
            + `gespielt wird auf ${POINTS_TO_WIN} gewonnene Ballwechsel (Sieg +${DUELL_WIN}, Niederlage -${DUELL_LOSS}, nie unter 0)\n` +
            `**/pingpong bestenliste** – Die Top 10 nach Gesamtpunkten\n` +
            `**/pingpong hilfe** – Zeigt diese Übersicht`
        );
    }
}

export default new PingPongHandler();
