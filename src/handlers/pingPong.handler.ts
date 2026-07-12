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

// Ansage-Duell (eigener Befehl neben dem normalen Duell): der Herausforderer sagt vorher an, ob er
// gewinnt oder verliert. Gespielt wird wie immer rein zufällig - trifft die Ansage, gibt es einen
// Extra-Punkt. Die Ansage steckt (wie die User-IDs) hinten in der customId, also kein Redis-State.
const ANSAGE_PREFIX = 'pingpong-ansage:';
const ANSAGE_BONUS = 1;

export type Ansage = 'sieg' | 'niederlage';

// Ein Duell ohne Ansage (normales /pingpong herausfordern) hat hier undefined stehen.
export function istAnsageEingetroffen(ansage: string | undefined, herausfordererGewinnt: boolean): boolean {
    if (ansage === 'sieg') return herausfordererGewinnt;
    if (ansage === 'niederlage') return !herausfordererGewinnt;
    return false;
}

// Die Ansage-Zeile fürs Ergebnis - null beim normalen Duell (da gab es keine Ansage).
export function formatAnsage(ansage: string | undefined, herausfordererId: string, herausfordererGewinnt: boolean): string | null {
    if (ansage !== 'sieg' && ansage !== 'niederlage') return null;

    const angesagt = ansage === 'sieg' ? 'den eigenen Sieg' : 'die eigene Niederlage';

    return istAnsageEingetroffen(ansage, herausfordererGewinnt)
        ? `Ansage getroffen: <@${herausfordererId}> hatte ${angesagt} angekündigt – **+${ANSAGE_BONUS}** Punkt extra.`
        : `Ansage daneben: <@${herausfordererId}> hatte ${angesagt} angekündigt. Kein Extra-Punkt.`;
}

// Siegesserie: laufender Zähler pro User (hoch bei Sieg, weg bei Niederlage) plus die längste
// je erreichte Serie als persönlicher Rekord. Erwähnt wird sie erst ab MIN_SERIE - eine "Serie"
// von einem einzelnen Duell ist keine.
const MIN_SERIE = 2;

const KEYS = {
    score: (userId: string) => userId + REDIS_KEYS.PING_PONG,
    highscore: REDIS_KEYS.PING_PONG,
    cooldown: (userId: string) => `PING_PONG:COOLDOWN:${userId}`,
    serie: (userId: string) => `PING_PONG:SERIE:${userId}`,
    rekord: (userId: string) => `PING_PONG:REKORD:${userId}`,
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

export interface SerienStand {
    siegerId: string;
    verliererId: string;
    serie: number;
    istNeuerRekord: boolean;
    beendeteSerie: number;
}

// Baut die Serien-Zeile fürs Duell-Ergebnis - oder null, wenn es nichts zu erzählen gibt
// (erster Sieg des Siegers, Verlierer hatte auch nichts laufen). Exportiert + getestet.
export function formatSerie({siegerId, verliererId, serie, istNeuerRekord, beendeteSerie}: SerienStand): string | null {
    const saetze: string[] = [];

    if (serie >= MIN_SERIE) {
        saetze.push(`<@${siegerId}> ist jetzt **${serie} Duelle in Folge** ungeschlagen.`);
        if (istNeuerRekord) {
            saetze.push('Das ist ein neuer persönlicher Rekord.');
        }
    }

    if (beendeteSerie >= MIN_SERIE) {
        saetze.push(`Die Serie von <@${verliererId}> endet nach **${beendeteSerie} Siegen**.`);
    }

    return saetze.length > 0 ? saetze.join(' ') : null;
}

class PingPongHandler {

    async handleHerausfordern(interaction: ChatInputCommandInteraction) {
        try {
            const herausforderer = interaction.user;
            const gegner = interaction.options.getUser('gegner', true);

            const abfuhr = await this.pruefeUndSetzeCooldown(herausforderer.id, gegner);
            if (abfuhr) {
                return interaction.reply({content: abfuhr, flags: MessageFlags.Ephemeral});
            }

            const row = this.baueDuellButtons(`${DUELL_PREFIX}annehmen:${herausforderer.id}:${gegner.id}`,
                `${DUELL_PREFIX}ablehnen:${herausforderer.id}:${gegner.id}`);

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

    // Ansage-Duell: derselbe Zufalls-Match wie beim normalen Duell, aber der Herausforderer sagt
    // vorher an, wie es ausgeht. Trifft er, gibt es einen Extra-Punkt obendrauf - eine falsche
    // Ansage kostet bewusst nichts extra (Sieg/Niederlage regeln die Punkte, die Ansage kann nur belohnen).
    async handleAnsageduell(interaction: ChatInputCommandInteraction) {
        try {
            const herausforderer = interaction.user;
            const gegner = interaction.options.getUser('gegner', true);
            const ansage = interaction.options.getString('ansage', true) as Ansage;

            const abfuhr = await this.pruefeUndSetzeCooldown(herausforderer.id, gegner);
            if (abfuhr) {
                return interaction.reply({content: abfuhr, flags: MessageFlags.Ephemeral});
            }

            const row = this.baueDuellButtons(`${ANSAGE_PREFIX}annehmen:${herausforderer.id}:${gegner.id}:${ansage}`,
                `${ANSAGE_PREFIX}ablehnen:${herausforderer.id}:${gegner.id}:${ansage}`);

            return interaction.reply({
                content: `<@${herausforderer.id}> fordert <@${gegner.id}> zu einem Ansage-Duell heraus `
                    + `und sagt **${ansage === 'sieg' ? 'den eigenen Sieg' : 'die eigene Niederlage'}** an.\n`
                    + `Gespielt wird auf **${POINTS_TO_WIN}** gewonnene Ballwechsel (Sieg **+${DUELL_WIN}**, `
                    + `Niederlage **-${DUELL_LOSS}**, nie unter 0). Geht die Ansage auf, gibt es **+${ANSAGE_BONUS}** Punkt extra.`,
                components: [row]
            });
        } catch (error) {
            console.error('Fehler beim Erstellen des Ping-Pong-Ansage-Duells:', error);
            return interaction.reply({
                content: 'Es gab einen Fehler beim Ausführen des Befehls.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Gemeinsame Vorprüfung beider Duell-Befehle. Gibt den Text der ephemeren Abfuhr zurück -
    // oder null, wenn losgespielt werden darf (dann ist der Cooldown gleich mit gesetzt).
    // Der Cooldown ist absichtlich für beide Duell-Arten derselbe Key, sonst könnte man
    // abwechselnd über zwei Befehle spammen.
    async pruefeUndSetzeCooldown(herausfordererId: string, gegner: {id: string, bot: boolean}): Promise<string | null> {
        if (gegner.id === herausfordererId) {
            return 'Gegen dich selbst zu spielen ist auf Dauer langweilig. Such dir jemanden.';
        }

        if (gegner.bot) {
            return 'Bots haben keine Hände. Fordere jemanden aus Fleisch und Blut heraus.';
        }

        const remaining = await redisService.getTimeToLive(KEYS.cooldown(herausfordererId));
        if (remaining > 0) {
            return `Kurz durchatmen – du kannst in **${remaining}s** wieder aufschlagen.`;
        }

        await redisService.setWithExpiry(KEYS.cooldown(herausfordererId), '1', COOLDOWN_SECONDS);
        return null;
    }

    baueDuellButtons(annehmenId: string, ablehnenId: string): ActionRowBuilder<ButtonBuilder> {
        const annehmen = new ButtonBuilder()
            .setCustomId(annehmenId)
            .setLabel('Annehmen')
            .setStyle(ButtonStyle.Success);

        const ablehnen = new ButtonBuilder()
            .setCustomId(ablehnenId)
            .setLabel('Ablehnen')
            .setStyle(ButtonStyle.Secondary);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(annehmen, ablehnen);
    }

    // Einstiegspunkt für die Buttons beider Duell-Arten - sie unterscheiden sich nur darin, ob
    // hinter der Gegner-ID noch eine Ansage in der customId steht.
    async handleDuellButton(interaction: ButtonInteraction) {
        const prefix = [DUELL_PREFIX, ANSAGE_PREFIX].find(p => interaction.customId.startsWith(p));
        if (!prefix) return;

        try {
            const [aktion, herausfordererId, gegnerId, ansage] = interaction.customId.slice(prefix.length).split(':');

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

            // Der Bonus geht immer an den Herausforderer - nur er hat eine Ansage gemacht.
            const ansageTrifft = istAnsageEingetroffen(ansage, herausfordererGewinnt);
            const bonusFuerSieger = ansageTrifft && herausfordererGewinnt ? ANSAGE_BONUS : 0;
            const bonusFuerVerlierer = ansageTrifft && !herausfordererGewinnt ? ANSAGE_BONUS : 0;

            const siegerScore = await this.getScore(siegerId);
            const verliererScore = await this.getScore(verliererId);

            const neuerSiegerScore = await this.updateScore(siegerId, siegerScore + DUELL_WIN + bonusFuerSieger);
            const neuerVerliererScore = await this.updateScore(verliererId,
                Math.max(0, verliererScore - DUELL_LOSS) + bonusFuerVerlierer);

            const satz = herausfordererGewinnt
                ? `${herausfordererPunkte}:${gegnerPunkte}`
                : `${gegnerPunkte}:${herausfordererPunkte}`;

            // Die Ansage ändert nichts am Spielausgang - die Serie zählt weiter nach Sieg/Niederlage.
            const serienZeile = formatSerie(await this.verarbeiteSerie(siegerId, verliererId));
            const ansageZeile = formatAnsage(ansage, herausfordererId, herausfordererGewinnt);

            return interaction.update({
                content: `**<@${siegerId}> gewinnt ${satz} gegen <@${verliererId}>.**\n`
                    + `${randomDuellFlavor()}\n`
                    + (ansageZeile ? `${ansageZeile}\n` : '')
                    + `<@${siegerId}>: **${neuerSiegerScore}** Punkte · <@${verliererId}>: **${neuerVerliererScore}** Punkte`
                    + (serienZeile ? `\n${serienZeile}` : ''),
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

    // Schreibt die Siegesserie beider Seiten fort: der Sieger zählt hoch (INCR legt den Key bei
    // Bedarf selbst an), die Serie des Verlierers ist beendet und wird gelöscht. Den Rekord halten
    // wir separat, damit er die abgerissene Serie überdauert.
    async verarbeiteSerie(siegerId: string, verliererId: string): Promise<SerienStand> {
        const beendeteSerie = this.convertScoreToNumber(await redisService.get(KEYS.serie(verliererId)) ?? 0);
        if (beendeteSerie > 0) {
            await redisService.delete(KEYS.serie(verliererId));
        }

        const serie = await redisService.increment(KEYS.serie(siegerId));
        const bisherigerRekord = this.convertScoreToNumber(await redisService.get(KEYS.rekord(siegerId)) ?? 0);
        const istNeuerRekord = serie > bisherigerRekord;

        if (istNeuerRekord) {
            await redisService.set(KEYS.rekord(siegerId), serie.toString());
        }

        return {siegerId, verliererId, serie, istNeuerRekord: istNeuerRekord && serie >= MIN_SERIE, beendeteSerie};
    }

    async getSerie(userId: string): Promise<number> {
        return this.convertScoreToNumber(await redisService.get(KEYS.serie(userId)) ?? 0);
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
            const serien = await Promise.all(
                highscore.map(item => this.getSerie(item.value))
            );

            const message = highscore
                .map((item, index) => {
                    const user = users[index];
                    const displayName = user?.displayName ?? item.value;
                    const serie = serien[index] >= MIN_SERIE ? ` (${serien[index]} in Folge)` : '';
                    return `${index + 1}. ${displayName} - ${item.score}${serie}`;
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
            `**/pingpong ansageduell** – Wie das Duell, aber du sagst vorher an, ob du gewinnst oder verlierst: `
            + `trifft die Ansage, gibt es **+${ANSAGE_BONUS}** Punkt extra (eine falsche Ansage kostet nichts)\n` +
            `**/pingpong bestenliste** – Die Top 10 nach Gesamtpunkten, mit laufender Siegesserie\n` +
            `**/pingpong hilfe** – Zeigt diese Übersicht`
        );
    }
}

export default new PingPongHandler();
