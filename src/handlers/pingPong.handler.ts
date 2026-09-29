import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageFlags
} from "discord.js";
import redisService from "../services/redis.service.js";
import userService from "../services/user.service.js";
import {formatMonat, monatsSchluessel} from "./pingPongSeason.handler.js";
import pingPongService, {PING_PONG_KEYS} from "../services/pingPong.service.js";
// Nur für das persönliche Morgengruß-Emoji in der Bestenliste. greeting.handler nutzt client
// ausschließlich in Methodenkörpern - die Zirkular-Import-Falle greift also nicht.
import greetingHandler, {emojiFuerNachricht} from "./greeting.handler.js";

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

// Ansage-Duell (eigener Befehl neben dem normalen Duell): der Herausforderer sagt vorher den eigenen
// Sieg an - der Befehl IST die Ansage, es gibt nichts zu wählen. Gespielt wird wie immer rein
// zufällig: Prahlerei erfüllt bringt einen Punkt extra, Prahlerei blamiert kostet einen zusätzlich.
// Bonus und Malus sind bewusst gleich groß (Erwartungswert null) - sonst wäre das Ansage-Duell
// strikt besser als das normale und würde es verdrängen. Eine Ansage "ich verliere" gibt es
// bewusst nicht: mit Bonus UND Malus käme sie rechnerisch immer auf 0 heraus (risikofreie
// Versicherung), das wäre eine tote Option.
// EINSCHRÄNKUNG, bewusst hingenommen: der Erwartungswert ist erst ab 2 Punkten null. Wer bei 0 oder
// 1 Punkt steht, dem schluckt der Clamp auf 0 (siehe DUELL_LOSS) einen Teil des Malus - dort ist das
// Ansage-Duell tatsächlich die bessere Wahl. Das ist die gleiche Linie wie beim Season-Titel:
// mitspielen darf sich lohnen (siehe Kommentar am Season-Block).
const ANSAGE_PREFIX = 'pingpong-ansage:';
const ANSAGE_BONUS = 1;
const ANSAGE_MALUS = 1;

// Taktikduell (eigener Befehl): beide wählen verdeckt eine Aktion, die Kombination entscheidet -
// Schere-Stein-Papier im Ringschluss. Die Wahl des Herausforderers steckt in der customId, die des
// Herausgeforderten ist der Button, den er klickt: also ebenfalls kein Redis-State.
// Bewusst hingenommen: technisch Versierte könnten die Wahl aus dem API-Payload lesen - im Client
// ist sie unsichtbar, und für eine Community-Spielerei reicht das.
const TAKTIK_PREFIX = 'pingpong-taktik:';

export type TaktikAktion = 'schmetterball' | 'konter' | 'lupfer';

export const TAKTIK_AKTIONEN: TaktikAktion[] = ['schmetterball', 'konter', 'lupfer'];

export const TAKTIK_LABELS: Record<TaktikAktion, string> = {
    schmetterball: 'Schmetterball',
    konter: 'Konter',
    lupfer: 'Lupfer',
};

// Ringschluss: Schmetterball schlägt Lupfer, Lupfer schlägt Konter, Konter schlägt Schmetterball.
const SCHLAEGT: Record<TaktikAktion, TaktikAktion> = {
    schmetterball: 'lupfer',
    lupfer: 'konter',
    konter: 'schmetterball',
};

export function entscheideTaktik(herausforderer: TaktikAktion, gegner: TaktikAktion): 'herausforderer' | 'gegner' | 'gleich' {
    if (herausforderer === gegner) return 'gleich';
    return SCHLAEGT[herausforderer] === gegner ? 'herausforderer' : 'gegner';
}

// Die Ansage-Zeile fürs Ergebnis - null beim normalen Duell (da wurde nichts angesagt).
export function formatAnsage(istAnsageDuell: boolean, herausfordererId: string, herausfordererGewinnt: boolean): string | null {
    if (!istAnsageDuell) return null;

    return herausfordererGewinnt
        ? `Ansage erfüllt: <@${herausfordererId}> hatte den eigenen Sieg angekündigt – **+${ANSAGE_BONUS}** Punkt extra.`
        : `Große Klappe: <@${herausfordererId}> hatte den eigenen Sieg angekündigt – **-${ANSAGE_MALUS}** Punkt zusätzlich.`;
}

// Siegesserie: laufender Zähler pro User (hoch bei Sieg, weg bei Niederlage) plus die längste
// je erreichte Serie als persönlicher Rekord. Erwähnt wird sie erst ab MIN_SERIE - eine "Serie"
// von einem einzelnen Duell ist keine. Dieselbe Schwelle filtert `/pingpong serienrekorde`
// (einschließend: eine Serie von genau MIN_SERIE gehört in die Liste) - exportiert, damit der
// Test die Grenze an derselben Zahl prüft, statt sie abzuschreiben.
export const MIN_SERIE = 2;

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

// Rundlauf ("Chinesisch", auch Ringelpitz): alle stehen gleichzeitig an der Platte und laufen
// reihum drumherum - wer den Ball nicht zurückbringt, fliegt raus. Das geht weiter, bis zwei übrig
// sind; die tragen ein normales Match aus (spieleDuell, derselbe Zufall wie beim Duell).
//
// Anders als die Duelle braucht der Rundlauf eine TEILNEHMERLISTE, und die passt nicht in eine
// customId (100 Zeichen, eine einzige Discord-ID belegt davon schon 18). Sie steht deshalb in der
// Lobby-Nachricht selbst - der Bot liest seinen eigenen Text zurück (parseTeilnehmer). Damit bleibt
// auch der Rundlauf zustandslos und übersteht einen Neustart, genau wie die Duelle; gespeichert
// wird erst das Ergebnis. Aus demselben Grund steht die Liste auf einer EIGENEN Zeile mit festem
// Marker: so kann der übrige Text geändert werden, ohne dass das Parsen bricht.
const RUNDLAUF_PREFIX = 'pingpong-rundlauf:';
const TEILNEHMER_MARKER = 'An der Platte';

// Unter drei Leuten ist es kein Rundlauf, sondern ein Duell (dafür gibt es `herausfordern`).
// Die Obergrenze hält Nachricht und Punkteverteilung im Rahmen - an einer Platte ist irgendwann
// schlicht kein Platz mehr.
export const MIN_RUNDLAUF = 3;
export const MAX_RUNDLAUF = 10;

// Beide Finalisten bekommen einen Punkt extra: das Finale ist die eigentliche Leistung, und ohne
// den Bonus wäre der Sprung vom letzten Ausgeschiedenen ins Finale nicht mehr wert als jedes
// andere Weiterkommen.
const RUNDLAUF_FINAL_BONUS = 1;

// Die Teilnehmerzeile der Lobby - Gegenstück zu parseTeilnehmer. Die Reihenfolge ist die
// Beitrittsreihenfolge, also die Aufstellung um die Platte.
export function formatTeilnehmerZeile(teilnehmer: string[]): string {
    return `${TEILNEHMER_MARKER} (${teilnehmer.length}): ${teilnehmer.map(id => `<@${id}>`).join(' ')}`;
}

// Liest die Teilnehmer aus der Lobby-Nachricht zurück (siehe RUNDLAUF_PREFIX). Bewusst nur aus der
// Marker-Zeile: der Eröffner wird im Text darüber ebenfalls erwähnt und stünde sonst doppelt drin.
// Doppelte IDs fliegen trotzdem raus - eine Platte, eine Person.
export function parseTeilnehmer(inhalt: string): string[] {
    return idsAusZeile(inhalt, TEILNEHMER_MARKER);
}

// Die IDs aus der ersten Zeile, die mit `marker` beginnt - Grundlage aller Lobbys, die ihren
// Zustand in der eigenen Nachricht tragen (Rundlauf, Doppel).
function idsAusZeile(inhalt: string, marker: string): string[] {
    const zeile = inhalt.split('\n').find(z => z.startsWith(marker));
    if (!zeile) return [];

    const ids = [...zeile.matchAll(/<@!?(\d+)>/g)].map(treffer => treffer[1]);
    return [...new Set(ids)];
}

export interface RundlaufErgebnis {
    // Aufsteigend nach Platzierung: vorne der als Erstes Ausgeschiedene, hinten der Sieger.
    reihenfolge: string[];
    // Das Finale der letzten beiden, aus Sicht des Siegers.
    finalSatz: {siegerPunkte: number; verliererPunkte: number};
}

// Spielt den Rundlauf durch: Runde für Runde fliegt zufällig eine Person raus (jeder Ball ist wie
// im Duell ein Münzwurf, nur eben reihum), bis zwei übrig sind - die spielen ein echtes Match.
// Exportiert + getestet, die Punktevergabe hängt daran.
export function spieleRundlauf(teilnehmer: string[]): RundlaufErgebnis {
    const imSpiel = [...teilnehmer];
    const reihenfolge: string[] = [];

    while (imSpiel.length > 2) {
        const [ausgeschieden] = imSpiel.splice(Math.floor(Math.random() * imSpiel.length), 1);
        reihenfolge.push(ausgeschieden);
    }

    const {herausfordererPunkte, gegnerPunkte} = spieleDuell();
    const ersterGewinnt = herausfordererPunkte > gegnerPunkte;
    const [erster, zweiter] = imSpiel;

    reihenfolge.push(ersterGewinnt ? zweiter : erster, ersterGewinnt ? erster : zweiter);

    return {
        reihenfolge,
        finalSatz: {
            siegerPunkte: Math.max(herausfordererPunkte, gegnerPunkte),
            verliererPunkte: Math.min(herausfordererPunkte, gegnerPunkte),
        },
    };
}

// Punkte je Platz, in derselben Reihenfolge wie RundlaufErgebnis.reihenfolge (also der als Erstes
// Ausgeschiedene zuerst). Roh bekommt jeder so viele Punkte, wie er Mitspieler überlebt hat, dazu
// den Finalisten-Bonus - bei fünf Leuten also 0 / 1 / 2 / 4 / 5.
//
// Davon wird der (gerundete) Schnitt abgezogen, aus 0/1/2/4/5 wird also -2/-1/0/+2/+3. Grund: ein
// Duell ist Nullsumme (+1/-1), ein Rundlauf ohne Abzug würde bei fünf Leuten 12 Punkte in die
// Season schütten und die Duelle in der Bestenliste verdrängen - dieselbe Überlegung wie bei
// ANSAGE_BONUS/ANSAGE_MALUS. Weil Punkte ganzzahlig sind, geht die Rechnung nicht immer glatt auf:
// es bleibt ein Rest von weniger als der halben Teilnehmerzahl stehen (bei fünf Leuten +2). Das ist
// gewollte Ungenauigkeit statt Bruchrechnung in der Bestenliste.
export function rundlaufPunkte(anzahl: number): number[] {
    const roh = Array.from({length: anzahl}, (_, platz) =>
        platz + (platz >= anzahl - 2 ? RUNDLAUF_FINAL_BONUS : 0));

    const abzug = Math.round(roh.reduce((summe, wert) => summe + wert, 0) / anzahl);
    return roh.map(punkte => punkte - abzug);
}

// Vorzeichenbehaftete Anzeige der Punkteänderung - die 0 bekommt bewusst ein ±, sonst liest sich
// die Zeile, als wäre die Änderung vergessen worden.
export function formatDelta(delta: number): string {
    if (delta > 0) return `+${delta}`;
    if (delta < 0) return `${delta}`;
    return '±0';
}

// Doppel (2 gegen 2): wie der Rundlauf eine Lobby, deren Zustand in der Nachricht steht. Zwei Arten,
// ein Befehl: MIT `partner` sind die Teams fest (Team 1 = Eröffner + Partner, die Gegner-Plätze
// werden benannt oder von den ersten Freiwilligen besetzt), OHNE Partner ist es eine offene Lobby,
// und der Bot lost die Teams aus, sobald vier dabei sind. Die Art steht in der customId
// (`pingpong-doppel:{aktion}:{eroeffnerId}:{fest|offen}`), weil sich beide Lobbys anders lesen.
//
// Anders als beim Rundlauf gibt es KEINEN Start-Button: bei genau vier Plätzen ist klar, wann es
// losgeht. Das hat eine Kehrseite - klicken der vierte und ein fünfter gleichzeitig, sähen beide
// eine Lobby mit drei Leuten und würden beide ein Match auslösen. Deshalb der Lock in
// PING_PONG_KEYS.doppelStart.
const DOPPEL_PREFIX = 'pingpong-doppel:';
const TEAM_1_MARKER = 'Team 1';
const TEAM_2_MARKER = 'Team 2';
const ZUSAGE_MARKER = 'Zusage fehlt';
export const DOPPEL_GROESSE = 4;
// Der Lock muss nur das Zeitfenster zwischen zwei Klicks abdecken; danach sind die Buttons ohnehin weg.
const DOPPEL_LOCK_SECONDS = 60;

export type DoppelModus = 'fest' | 'offen';

// Zustand einer Lobby mit festen Teams. `ausstehend` sind eingeladene Personen (Partner, benannte
// Gegner), die ihren Platz schon haben, aber noch nicht zugesagt haben.
export interface DoppelLobby {
    team1: string[];
    team2: string[];
    ausstehend: string[];
}

const mentions = (ids: string[]) => ids.map(id => `<@${id}>`).join(' ');

// Die Zustandszeilen der festen Lobby - Gegenstück zu parseDoppelLobby.
export function formatDoppelZeilen({team1, team2, ausstehend}: DoppelLobby): string {
    const frei = 2 - team2.length;
    const zeilen = [
        `${TEAM_1_MARKER}: ${mentions(team1)}`,
        `${TEAM_2_MARKER}: ${mentions(team2)}${frei > 0 ? `${team2.length > 0 ? ' · ' : ''}noch ${frei} ${frei === 1 ? 'Platz' : 'Plätze'} frei` : ''}`,
    ];
    if (ausstehend.length > 0) {
        zeilen.push(`${ZUSAGE_MARKER}: ${mentions(ausstehend)}`);
    }
    return zeilen.join('\n');
}

export function parseDoppelLobby(inhalt: string): DoppelLobby {
    return {
        team1: idsAusZeile(inhalt, TEAM_1_MARKER),
        team2: idsAusZeile(inhalt, TEAM_2_MARKER),
        ausstehend: idsAusZeile(inhalt, ZUSAGE_MARKER),
    };
}

// Mischt die vier Leute der offenen Lobby (Fisher-Yates) und teilt sie in zwei Teams.
export function loseTeams(spieler: string[]): [string[], string[]] {
    const gemischt = [...spieler];
    for (let i = gemischt.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]];
    }
    const haelfte = gemischt.length / 2;
    return [gemischt.slice(0, haelfte), gemischt.slice(haelfte)];
}

class PingPongHandler {

    async handleHerausfordern(interaction: ChatInputCommandInteraction) {
        return this.starteDuell(interaction, DUELL_PREFIX,
            (herausfordererId, gegnerId) =>
                `<@${herausfordererId}> fordert <@${gegnerId}> zu einem Ping-Pong-Duell heraus.\n`
                + `Gespielt wird auf **${POINTS_TO_WIN}** gewonnene Ballwechsel. `
                + `Der Sieg bringt **+${DUELL_WIN}** Punkt, die Niederlage kostet **${DUELL_LOSS}** (nie unter 0).`,
            'Fehler beim Erstellen der Ping-Pong-Herausforderung:');
    }

    // Ansage-Duell: derselbe Zufalls-Match wie beim normalen Duell, aber der Herausforderer sagt mit
    // dem Befehl den eigenen Sieg an - va banque. Geht es auf, gibt es einen Punkt extra; geht es
    // schief, kostet es einen zusätzlich (siehe ANSAGE_BONUS/ANSAGE_MALUS).
    async handleAnsageduell(interaction: ChatInputCommandInteraction) {
        return this.starteDuell(interaction, ANSAGE_PREFIX,
            (herausfordererId, gegnerId) =>
                `<@${herausfordererId}> fordert <@${gegnerId}> zu einem Ansage-Duell heraus `
                + `und kündigt schon mal den **eigenen Sieg** an.\n`
                + `Gespielt wird auf **${POINTS_TO_WIN}** gewonnene Ballwechsel (Sieg **+${DUELL_WIN}**, `
                + `Niederlage **-${DUELL_LOSS}**, nie unter 0). Geht die Ansage auf, gibt es **+${ANSAGE_BONUS}** Punkt extra – `
                + `geht sie daneben, kostet die große Klappe **${ANSAGE_MALUS}** Punkt zusätzlich.`,
            'Fehler beim Erstellen des Ping-Pong-Ansage-Duells:');
    }

    // Gemeinsamer Ablauf von `herausfordern` und `ansageduell`: Gegner lesen, Cooldown prüfen,
    // Annehmen/Ablehnen-Buttons mit dem jeweiligen customId-Prefix posten. Die beiden Befehle
    // unterscheiden sich NUR im Prefix und im Ankündigungstext - das Taktikduell nicht, es hat
    // vier Buttons und die Aktion in der customId und bleibt deshalb eigenständig.
    async starteDuell(interaction: ChatInputCommandInteraction, prefix: string,
                      baueText: (herausfordererId: string, gegnerId: string) => string,
                      fehlerText: string) {
        try {
            const herausforderer = interaction.user;
            const gegner = interaction.options.getUser('gegner', true);

            const abfuhr = await this.pruefeUndSetzeCooldown(herausforderer.id, gegner);
            if (abfuhr) {
                return interaction.reply({content: abfuhr, flags: MessageFlags.Ephemeral});
            }

            const row = this.baueDuellButtons(`${prefix}annehmen:${herausforderer.id}:${gegner.id}`,
                `${prefix}ablehnen:${herausforderer.id}:${gegner.id}`);

            return interaction.reply({content: baueText(herausforderer.id, gegner.id), components: [row]});
        } catch (error) {
            console.error(fehlerText, error);
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

        return this.pruefeCooldown(herausfordererId);
    }

    // Der Cooldown allein, ohne Gegner-Prüfung: der Rundlauf hat keinen benannten Gegner, teilt
    // sich den Key aber mit den Duellen - sonst könnte man abwechselnd über mehrere Befehle spammen.
    async pruefeCooldown(userId: string): Promise<string | null> {
        const remaining = await redisService.getTimeToLive(PING_PONG_KEYS.cooldown(userId));
        if (remaining > 0) {
            return `Kurz durchatmen – du kannst in **${remaining}s** wieder aufschlagen.`;
        }

        await redisService.setWithExpiry(PING_PONG_KEYS.cooldown(userId), '1', COOLDOWN_SECONDS);
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
            const [aktion, herausfordererId, gegnerId] = interaction.customId.slice(prefix.length).split(':');
            const istAnsageDuell = prefix === ANSAGE_PREFIX;

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

            // Ansage-Duell: nur der Herausforderer hat angesagt. Erfüllt er sie, ist er der Sieger
            // und bekommt den Bonus; verliert er, ist er der Verlierer und zahlt den Malus obendrauf.
            const bonusFuerSieger = istAnsageDuell && herausfordererGewinnt ? ANSAGE_BONUS : 0;
            const malusFuerVerlierer = istAnsageDuell && !herausfordererGewinnt ? ANSAGE_MALUS : 0;

            const {punkteZeile, serienZeile} = await this.trageErgebnisEin(siegerId, verliererId,
                bonusFuerSieger, -malusFuerVerlierer);

            const satz = herausfordererGewinnt
                ? `${herausfordererPunkte}:${gegnerPunkte}`
                : `${gegnerPunkte}:${herausfordererPunkte}`;

            const ansageZeile = formatAnsage(istAnsageDuell, herausfordererId, herausfordererGewinnt);

            return interaction.update({
                content: `**<@${siegerId}> gewinnt ${satz} gegen <@${verliererId}>.**\n`
                    + `${randomDuellFlavor()}\n`
                    + (ansageZeile ? `${ansageZeile}\n` : '')
                    + punkteZeile
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

    // Punkte + Siegesserie nach einem entschiedenen Match - von allen drei Duell-Arten geteilt.
    // `zusatzFuerVerlierer` ist der (negative) Ansage-Malus; der Clamp auf 0 greift erst danach,
    // damit auch ein doppelter Abzug niemanden ins Minus spielt.
    async trageErgebnisEin(siegerId: string, verliererId: string, bonusFuerSieger = 0, zusatzFuerVerlierer = 0)
        : Promise<{punkteZeile: string, serienZeile: string | null}> {
        const siegerScore = await this.getScore(siegerId);
        const verliererScore = await this.getScore(verliererId);

        const neuerSiegerScore = await this.updateScore(siegerId, siegerScore + DUELL_WIN + bonusFuerSieger);
        const neuerVerliererScore = await this.updateScore(verliererId,
            Math.max(0, verliererScore - DUELL_LOSS + zusatzFuerVerlierer));

        const serienZeile = formatSerie(await this.verarbeiteSerie(siegerId, verliererId));

        return {
            punkteZeile: `<@${siegerId}>: **${neuerSiegerScore}** Punkte · <@${verliererId}>: **${neuerVerliererScore}** Punkte`,
            serienZeile
        };
    }

    // Taktikduell: eigener Befehl, bei dem beide Seiten verdeckt eine Aktion wählen. Die Wahl des
    // Herausforderers steht schon in der customId der Buttons, die des Herausgeforderten ergibt sich
    // daraus, welchen der drei Aktions-Buttons er klickt - dadurch bleibt auch das zustandslos.
    async handleTaktikduell(interaction: ChatInputCommandInteraction) {
        try {
            const herausforderer = interaction.user;
            const gegner = interaction.options.getUser('gegner', true);
            const aktion = interaction.options.getString('aktion', true) as TaktikAktion;

            const abfuhr = await this.pruefeUndSetzeCooldown(herausforderer.id, gegner);
            if (abfuhr) {
                return interaction.reply({content: abfuhr, flags: MessageFlags.Ephemeral});
            }

            const buttons = TAKTIK_AKTIONEN.map(a => new ButtonBuilder()
                .setCustomId(`${TAKTIK_PREFIX}${a}:${herausforderer.id}:${gegner.id}:${aktion}`)
                .setLabel(TAKTIK_LABELS[a])
                .setStyle(ButtonStyle.Primary));

            buttons.push(new ButtonBuilder()
                .setCustomId(`${TAKTIK_PREFIX}ablehnen:${herausforderer.id}:${gegner.id}:${aktion}`)
                .setLabel('Ablehnen')
                .setStyle(ButtonStyle.Secondary));

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

            return interaction.reply({
                content: `<@${herausforderer.id}> fordert <@${gegner.id}> zu einem Taktikduell heraus `
                    + `und hat sich verdeckt für eine Aktion entschieden.\n`
                    + `<@${gegner.id}>, wähle deine Antwort: **Schmetterball** übertrumpft den Lupfer, `
                    + `der **Lupfer** übertrumpft den Konter, der **Konter** übertrumpft den Schmetterball. `
                    + `Wählt ihr dasselbe, entscheidet ein Ballwechsel.\n`
                    + `Der Sieg bringt **+${DUELL_WIN}** Punkt, die Niederlage kostet **${DUELL_LOSS}** (nie unter 0).`,
                components: [row]
            });
        } catch (error) {
            console.error('Fehler beim Erstellen des Ping-Pong-Taktikduells:', error);
            return interaction.reply({
                content: 'Es gab einen Fehler beim Ausführen des Befehls.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async handleTaktikButton(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith(TAKTIK_PREFIX)) return;

        try {
            const [gegnerAktion, herausfordererId, gegnerId, herausfordererAktion] =
                interaction.customId.slice(TAKTIK_PREFIX.length).split(':');

            if (interaction.user.id !== gegnerId) {
                return interaction.reply({
                    content: 'Diese Herausforderung gilt nicht dir.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (gegnerAktion === 'ablehnen') {
                return interaction.update({
                    content: `<@${gegnerId}> lehnt die Herausforderung von <@${herausfordererId}> ab. Kein Duell heute.`,
                    components: []
                });
            }

            const ausgang = entscheideTaktik(herausfordererAktion as TaktikAktion, gegnerAktion as TaktikAktion);

            // Gleiche Aktion = Patt: dann entscheidet wie beim normalen Duell der Zufall.
            const {herausfordererPunkte, gegnerPunkte} = spieleDuell();
            const herausfordererGewinnt = ausgang === 'gleich'
                ? herausfordererPunkte > gegnerPunkte
                : ausgang === 'herausforderer';

            const siegerId = herausfordererGewinnt ? herausfordererId : gegnerId;
            const verliererId = herausfordererGewinnt ? gegnerId : herausfordererId;

            const {punkteZeile, serienZeile} = await this.trageErgebnisEin(siegerId, verliererId);

            const wahlZeile = `<@${herausfordererId}>: **${TAKTIK_LABELS[herausfordererAktion as TaktikAktion]}** `
                + `· <@${gegnerId}>: **${TAKTIK_LABELS[gegnerAktion as TaktikAktion]}**`;

            const entscheidung = ausgang === 'gleich'
                ? `Dieselbe Aktion – der Ballwechsel entscheidet, ${herausfordererGewinnt ? herausfordererPunkte : gegnerPunkte}:`
                    + `${herausfordererGewinnt ? gegnerPunkte : herausfordererPunkte} für <@${siegerId}>.`
                : `**${TAKTIK_LABELS[(herausfordererGewinnt ? herausfordererAktion : gegnerAktion) as TaktikAktion]}** `
                    + `übertrumpft **${TAKTIK_LABELS[(herausfordererGewinnt ? gegnerAktion : herausfordererAktion) as TaktikAktion]}**.`;

            return interaction.update({
                content: `${wahlZeile}\n`
                    + `${entscheidung}\n`
                    + `**<@${siegerId}> gewinnt gegen <@${verliererId}>.**\n`
                    + punkteZeile
                    + (serienZeile ? `\n${serienZeile}` : ''),
                components: []
            });
        } catch (error) {
            console.error('Fehler beim Austragen des Ping-Pong-Taktikduells:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Das Duell konnte nicht ausgetragen werden.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }

    // Rundlauf: eine offene Lobby statt einer gezielten Herausforderung. Wer mitspielen will,
    // stellt sich per Button dazu; gestartet wird von Hand, weil niemand wissen kann, wer noch
    // dazukommt. Der Eröffner steht von Anfang an mit an der Platte (er hat aufgerufen).
    async handleRundlauf(interaction: ChatInputCommandInteraction) {
        try {
            const abfuhr = await this.pruefeCooldown(interaction.user.id);
            if (abfuhr) {
                return interaction.reply({content: abfuhr, flags: MessageFlags.Ephemeral});
            }

            return interaction.reply({
                content: this.baueLobbyText(interaction.user.id, [interaction.user.id]),
                components: [this.baueRundlaufButtons(interaction.user.id)],
            });
        } catch (error) {
            console.error('Fehler beim Eröffnen des Ping-Pong-Rundlaufs:', error);
            return interaction.reply({
                content: 'Es gab einen Fehler beim Ausführen des Befehls.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Der Lobby-Text wird bei jedem Beitritt neu gebaut - die Teilnehmerzeile am Ende ist zugleich
    // der Speicherort der Runde (siehe parseTeilnehmer).
    baueLobbyText(eroeffnerId: string, teilnehmer: string[]): string {
        return `<@${eroeffnerId}> eröffnet einen **Rundlauf** – Chinesisch, einmal rund um die Platte.\n`
            + `Alle spielen gleichzeitig: reihum wird angenommen, wer den Ball nicht zurückbringt, fliegt raus. `
            + `Am Ende tragen die letzten beiden ein Match auf **${POINTS_TO_WIN}** gewonnene Ballwechsel aus.\n`
            + `Punkte nach Platzierung – die vorderen Plätze gewinnen, die hinteren zahlen drauf (nie unter 0), `
            + `die beiden Finalisten bekommen **+${RUNDLAUF_FINAL_BONUS}** extra.\n`
            + `Ab **${MIN_RUNDLAUF}** Personen kann <@${eroeffnerId}> losspielen, mehr als **${MAX_RUNDLAUF}** passen nicht an die Platte.\n\n`
            + formatTeilnehmerZeile(teilnehmer);
    }

    baueRundlaufButtons(eroeffnerId: string): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${RUNDLAUF_PREFIX}beitreten:${eroeffnerId}`)
                .setLabel('An die Platte')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`${RUNDLAUF_PREFIX}verlassen:${eroeffnerId}`)
                .setLabel('Doch nicht')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${RUNDLAUF_PREFIX}starten:${eroeffnerId}`)
                .setLabel('Losspielen')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`${RUNDLAUF_PREFIX}abbrechen:${eroeffnerId}`)
                .setLabel('Abbrechen')
                .setStyle(ButtonStyle.Danger),
        );
    }

    // Eigener Einstiegspunkt wie handleTaktikButton (in interaction.handler.ts zusätzlich
    // verkabelt, jeder Button-Handler prüft sein Prefix selbst). Der Zustand kommt aus der
    // Nachricht, nicht aus der customId - dort steht nur, wer die Runde eröffnet hat.
    async handleRundlaufButton(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith(RUNDLAUF_PREFIX)) return;

        try {
            const [aktion, eroeffnerId] = interaction.customId.slice(RUNDLAUF_PREFIX.length).split(':');
            const teilnehmer = parseTeilnehmer(interaction.message.content);
            const istEroeffner = interaction.user.id === eroeffnerId;

            if (aktion === 'abbrechen') {
                if (!istEroeffner) {
                    return interaction.reply({
                        content: 'Nur wer den Rundlauf eröffnet hat, kann ihn absagen.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return interaction.update({
                    content: `<@${eroeffnerId}> sagt den Rundlauf ab. Die Platte bleibt heute leer.`,
                    components: []
                });
            }

            if (aktion === 'beitreten') {
                if (teilnehmer.includes(interaction.user.id)) {
                    return interaction.reply({
                        content: 'Du stehst schon an der Platte.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                if (teilnehmer.length >= MAX_RUNDLAUF) {
                    return interaction.reply({
                        content: `An der Platte ist kein Platz mehr – mehr als ${MAX_RUNDLAUF} Leute werden zum Gedränge.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                return interaction.update({
                    content: this.baueLobbyText(eroeffnerId, [...teilnehmer, interaction.user.id]),
                    components: [this.baueRundlaufButtons(eroeffnerId)],
                });
            }

            if (aktion === 'verlassen') {
                // Der Eröffner ist der Gastgeber: ginge er, bliebe eine Runde stehen, die niemand
                // mehr starten kann (der Start hängt an seiner ID in der customId).
                if (istEroeffner) {
                    return interaction.reply({
                        content: 'Du hast die Runde eröffnet – wenn du nicht mehr magst, sag sie über **Abbrechen** ab.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                if (!teilnehmer.includes(interaction.user.id)) {
                    return interaction.reply({
                        content: 'Du stehst gar nicht an der Platte.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return interaction.update({
                    content: this.baueLobbyText(eroeffnerId, teilnehmer.filter(id => id !== interaction.user.id)),
                    components: [this.baueRundlaufButtons(eroeffnerId)],
                });
            }

            if (!istEroeffner) {
                return interaction.reply({
                    content: 'Nur wer den Rundlauf eröffnet hat, startet ihn auch.',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (teilnehmer.length < MIN_RUNDLAUF) {
                return interaction.reply({
                    content: `Zu zweit ist das ein Duell, kein Rundlauf – es braucht mindestens **${MIN_RUNDLAUF}** Leute `
                        + `(\`/pingpong herausfordern\` wäre der richtige Befehl).`,
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.update(await this.spieleUndWerteRundlaufAus(teilnehmer));
        } catch (error) {
            console.error('Fehler beim Austragen des Ping-Pong-Rundlaufs:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Der Rundlauf konnte nicht ausgetragen werden.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }

    // Spielt die Runde durch, schreibt die Punkte fort und baut die Ergebnisnachricht. Getrennt von
    // handleRundlaufButton, damit der Ablauf ohne Discord-Interaction testbar bleibt.
    async spieleUndWerteRundlaufAus(teilnehmer: string[]): Promise<{content: string, components: []}> {
        const {reihenfolge, finalSatz} = spieleRundlauf(teilnehmer);
        const punkte = rundlaufPunkte(reihenfolge.length);

        const siegerId = reihenfolge[reihenfolge.length - 1];
        const finalVerliererId = reihenfolge[reihenfolge.length - 2];

        // Bewusst der Reihe nach statt parallel: getScore legt fehlende Einzelkeys selbst an, und
        // zwei gleichzeitige Schreibvorgänge auf denselben Key sind unnötiges Risiko.
        const zeilen: string[] = [];
        for (let platz = reihenfolge.length - 1; platz >= 0; platz--) {
            const userId = reihenfolge[platz];
            const alterScore = await this.getScore(userId);
            const neuerScore = await this.updateScore(userId, Math.max(0, alterScore + punkte[platz]));

            zeilen.push(`${reihenfolge.length - platz}. <@${userId}> **${formatDelta(punkte[platz])}** → ${neuerScore} Punkte`);
        }

        // Die Serie richtet sich nach dem Finale: das ist das einzige echte Match im Rundlauf.
        // Wer vorher rausgeflogen ist, verliert seine laufende Serie also nicht - er hat auch
        // gegen niemanden verloren.
        const serienZeile = formatSerie(await this.verarbeiteSerie(siegerId, finalVerliererId));

        return {
            content: `**<@${siegerId}> gewinnt den Rundlauf.**\n`
                + `Im Finale gegen <@${finalVerliererId}> steht es am Ende ${finalSatz.siegerPunkte}:${finalSatz.verliererPunkte}. `
                + `${randomDuellFlavor()}\n\n`
                + zeilen.join('\n')
                + (serienZeile ? `\n\n${serienZeile}` : ''),
            components: []
        };
    }

    // Doppel: mit `partner` feste Teams (benannte Gegner optional), ohne eine offene Lobby mit
    // ausgelosten Teams (siehe DOPPEL_PREFIX). Den Cooldown bekommt nur der Eröffner - wie beim
    // Duell hat niemand sonst etwas angezettelt.
    async handleDoppel(interaction: ChatInputCommandInteraction) {
        try {
            const eroeffnerId = interaction.user.id;
            const partner = interaction.options.getUser('partner');
            const gegner = [interaction.options.getUser('gegner1'), interaction.options.getUser('gegner2')]
                .filter(user => user !== null);

            if (!partner && gegner.length > 0) {
                return interaction.reply({
                    content: 'Gegner lassen sich nur zusammen mit einem festen `partner` festlegen – '
                        + 'ohne Partner lost der Bot die Teams aus.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const abfuhr = this.pruefeDoppelBesetzung(eroeffnerId, partner ? [partner, ...gegner] : [])
                ?? await this.pruefeCooldown(eroeffnerId);
            if (abfuhr) {
                return interaction.reply({content: abfuhr, flags: MessageFlags.Ephemeral});
            }

            if (!partner) {
                return interaction.reply({
                    content: this.baueOffenenDoppelText(eroeffnerId, [eroeffnerId]),
                    components: [this.baueDoppelButtons(eroeffnerId, 'offen')],
                });
            }

            const gegnerIds = gegner.map(user => user.id);
            return interaction.reply({
                content: this.baueFestenDoppelText(eroeffnerId, {
                    team1: [eroeffnerId, partner.id],
                    team2: gegnerIds,
                    ausstehend: [partner.id, ...gegnerIds],
                }),
                components: [this.baueDoppelButtons(eroeffnerId, 'fest')],
            });
        } catch (error) {
            console.error('Fehler beim Eröffnen des Ping-Pong-Doppels:', error);
            return interaction.reply({
                content: 'Es gab einen Fehler beim Ausführen des Befehls.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Die benannten Mitspieler: niemand doppelt, nicht man selbst, keine Bots.
    pruefeDoppelBesetzung(eroeffnerId: string, benannt: {id: string, bot: boolean}[]): string | null {
        if (benannt.some(user => user.id === eroeffnerId)) {
            return 'Du stehst schon selbst an der Platte – such dir für die anderen Plätze jemand anderen.';
        }
        if (benannt.some(user => user.bot)) {
            return 'Bots haben keine Hände. Stell dir ein Team aus Fleisch und Blut zusammen.';
        }
        if (new Set(benannt.map(user => user.id)).size !== benannt.length) {
            return 'Eine Person kann nur einen Platz besetzen.';
        }
        return null;
    }

    baueFestenDoppelText(eroeffnerId: string, lobby: DoppelLobby): string {
        const [, partnerId] = lobby.team1;
        return `<@${eroeffnerId}> sucht zusammen mit <@${partnerId}> Gegner für ein **Doppel**.\n`
            + `Wer eingeladen ist, sagt über **Dabei** zu; freie Gegner-Plätze bekommt, wer zuerst klickt. `
            + `Sobald alle vier zugesagt haben, geht es los.\n`
            + this.doppelRegelZeile() + '\n\n'
            + formatDoppelZeilen(lobby);
    }

    baueOffenenDoppelText(eroeffnerId: string, teilnehmer: string[]): string {
        return `<@${eroeffnerId}> eröffnet ein **Doppel** mit ausgelosten Teams.\n`
            + `Wer mitspielen will, klickt auf **Dabei** – sobald ${DOPPEL_GROESSE} an der Platte stehen, `
            + `lost der Bot die Teams aus und das Match beginnt.\n`
            + this.doppelRegelZeile() + '\n\n'
            + formatTeilnehmerZeile(teilnehmer);
    }

    doppelRegelZeile(): string {
        return `Gespielt wird auf **${POINTS_TO_WIN}** gewonnene Ballwechsel. Jede Person im Siegerteam bekommt `
            + `**+${DUELL_WIN}** Punkt, jede im Verliererteam verliert **${DUELL_LOSS}** (nie unter 0).`;
    }

    baueDoppelButtons(eroeffnerId: string, modus: DoppelModus): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${DOPPEL_PREFIX}dabei:${eroeffnerId}:${modus}`)
                .setLabel('Dabei')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`${DOPPEL_PREFIX}raus:${eroeffnerId}:${modus}`)
                .setLabel('Doch nicht')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${DOPPEL_PREFIX}abbrechen:${eroeffnerId}:${modus}`)
                .setLabel('Abbrechen')
                .setStyle(ButtonStyle.Danger),
        );
    }

    // Eigener Einstiegspunkt wie beim Rundlauf (in interaction.handler.ts zusätzlich verkabelt).
    async handleDoppelButton(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith(DOPPEL_PREFIX)) return;

        try {
            const [aktion, eroeffnerId, modus] = interaction.customId.slice(DOPPEL_PREFIX.length).split(':');
            const userId = interaction.user.id;

            if (aktion === 'abbrechen') {
                if (userId !== eroeffnerId) {
                    return interaction.reply({
                        content: 'Nur wer das Doppel eröffnet hat, kann es absagen.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return interaction.update({
                    content: `<@${eroeffnerId}> sagt das Doppel ab. Die Platte bleibt heute leer.`,
                    components: []
                });
            }

            // Wie beim Rundlauf: ginge der Eröffner, bliebe eine Lobby stehen, die niemand absagen kann.
            if (aktion === 'raus' && userId === eroeffnerId) {
                return interaction.reply({
                    content: 'Du hast das Doppel eröffnet – wenn du nicht mehr magst, sag es über **Abbrechen** ab.',
                    flags: MessageFlags.Ephemeral
                });
            }

            return modus === 'offen'
                ? await this.bearbeiteOffenesDoppel(interaction, aktion, eroeffnerId)
                : await this.bearbeiteFestesDoppel(interaction, aktion, eroeffnerId);
        } catch (error) {
            console.error('Fehler beim Austragen des Ping-Pong-Doppels:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Das Doppel konnte nicht ausgetragen werden.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }

    async bearbeiteOffenesDoppel(interaction: ButtonInteraction, aktion: string, eroeffnerId: string) {
        const userId = interaction.user.id;
        const teilnehmer = parseTeilnehmer(interaction.message.content);

        if (aktion === 'raus') {
            if (!teilnehmer.includes(userId)) {
                return interaction.reply({content: 'Du stehst gar nicht an der Platte.', flags: MessageFlags.Ephemeral});
            }
            return interaction.update({
                content: this.baueOffenenDoppelText(eroeffnerId, teilnehmer.filter(id => id !== userId)),
                components: [this.baueDoppelButtons(eroeffnerId, 'offen')],
            });
        }

        if (teilnehmer.includes(userId)) {
            return interaction.reply({content: 'Du stehst schon an der Platte.', flags: MessageFlags.Ephemeral});
        }

        const neu = [...teilnehmer, userId];
        if (neu.length < DOPPEL_GROESSE) {
            return interaction.update({
                content: this.baueOffenenDoppelText(eroeffnerId, neu),
                components: [this.baueDoppelButtons(eroeffnerId, 'offen')],
            });
        }

        const [team1, team2] = loseTeams(neu);
        return this.starteDoppel(interaction, team1, team2, true);
    }

    async bearbeiteFestesDoppel(interaction: ButtonInteraction, aktion: string, eroeffnerId: string) {
        const userId = interaction.user.id;
        const lobby = parseDoppelLobby(interaction.message.content);
        const [, partnerId] = lobby.team1;
        const istDabei = [...lobby.team1, ...lobby.team2].includes(userId);

        if (aktion === 'raus') {
            // Das Team ist fest - springt der Partner ab, gibt es kein Doppel mehr.
            if (userId === partnerId) {
                return interaction.update({
                    content: `<@${partnerId}> springt ab – das Doppel mit <@${eroeffnerId}> fällt aus.`,
                    components: []
                });
            }
            if (!lobby.team2.includes(userId)) {
                return interaction.reply({content: 'Du bist gar nicht dabei.', flags: MessageFlags.Ephemeral});
            }
            // Ein Gegner (eingeladen oder freiwillig) gibt seinen Platz frei, der Rest bleibt stehen.
            return interaction.update({
                content: this.baueFestenDoppelText(eroeffnerId, {
                    team1: lobby.team1,
                    team2: lobby.team2.filter(id => id !== userId),
                    ausstehend: lobby.ausstehend.filter(id => id !== userId),
                }),
                components: [this.baueDoppelButtons(eroeffnerId, 'fest')],
            });
        }

        let neu: DoppelLobby;
        if (lobby.ausstehend.includes(userId)) {
            neu = {...lobby, ausstehend: lobby.ausstehend.filter(id => id !== userId)};
        } else if (istDabei) {
            return interaction.reply({content: 'Du bist schon dabei.', flags: MessageFlags.Ephemeral});
        } else if (lobby.team2.length >= 2) {
            return interaction.reply({
                content: 'Beide Gegner-Plätze sind schon vergeben.',
                flags: MessageFlags.Ephemeral
            });
        } else {
            neu = {...lobby, team2: [...lobby.team2, userId]};
        }

        if (neu.team2.length < 2 || neu.ausstehend.length > 0) {
            return interaction.update({
                content: this.baueFestenDoppelText(eroeffnerId, neu),
                components: [this.baueDoppelButtons(eroeffnerId, 'fest')],
            });
        }

        return this.starteDoppel(interaction, neu.team1, neu.team2, false);
    }

    // Der Lock verhindert, dass zwei gleichzeitige Klicks zwei Matches auslösen (siehe DOPPEL_PREFIX).
    async starteDoppel(interaction: ButtonInteraction, team1: string[], team2: string[], gelost: boolean) {
        const erster = await redisService.setIfAbsent(PING_PONG_KEYS.doppelStart(interaction.message.id), '1',
            DOPPEL_LOCK_SECONDS);
        if (!erster) {
            return interaction.reply({
                content: 'Zu spät – das Doppel ist gerade voll geworden und läuft schon.',
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.update(await this.spieleUndWerteDoppelAus(team1, team2, gelost));
    }

    // Spielt das Match, schreibt Punkte und Serien fort und baut die Ergebnisnachricht. Getrennt vom
    // Button-Handler, damit der Ablauf ohne Discord-Interaction testbar bleibt (Muster Rundlauf).
    async spieleUndWerteDoppelAus(team1: string[], team2: string[], gelost: boolean)
        : Promise<{content: string, components: []}> {
        const {herausfordererPunkte, gegnerPunkte} = spieleDuell();
        const team1Gewinnt = herausfordererPunkte > gegnerPunkte;
        const sieger = team1Gewinnt ? team1 : team2;
        const verlierer = team1Gewinnt ? team2 : team1;

        // Der Reihe nach wie beim Rundlauf - getScore legt fehlende Einzelkeys selbst an.
        const punkte: string[] = [];
        for (const id of sieger) {
            punkte.push(`<@${id}>: **${await this.updateScore(id, await this.getScore(id) + DUELL_WIN)}**`);
        }
        for (const id of verlierer) {
            punkte.push(`<@${id}>: **${await this.updateScore(id, Math.max(0, await this.getScore(id) - DUELL_LOSS))}**`);
        }

        // Die Serie zählt wie im Duell (User-Entscheidung): beide Sieger zählen hoch, beide Verlierer
        // verlieren ihre. Die Paarung ist beliebig - verarbeiteSerie fasst jede Seite nur für sich an.
        const serienZeilen: string[] = [];
        for (let i = 0; i < sieger.length; i++) {
            const zeile = formatSerie(await this.verarbeiteSerie(sieger[i], verlierer[i]));
            if (zeile) serienZeilen.push(zeile);
        }

        const team = (ids: string[]) => ids.map(id => `<@${id}>`).join(' & ');
        const satz = `${Math.max(herausfordererPunkte, gegnerPunkte)}:${Math.min(herausfordererPunkte, gegnerPunkte)}`;

        return {
            content: (gelost ? `Das Los stellt die Teams: ${team(team1)} gegen ${team(team2)}.\n` : '')
                + `**${team(sieger)} gewinnen ${satz} gegen ${team(verlierer)}.**\n`
                + `${randomDuellFlavor()}\n`
                + `Punkte: ${punkte.join(' · ')}`
                + (serienZeilen.length > 0 ? `\n${serienZeilen.join('\n')}` : ''),
            components: []
        };
    }

    // Schreibt die Siegesserie beider Seiten fort: der Sieger zählt hoch (INCR legt den Key bei
    // Bedarf selbst an), die Serie des Verlierers ist beendet und wird gelöscht. Den Rekord halten
    // wir separat, damit er die abgerissene Serie überdauert.
    async verarbeiteSerie(siegerId: string, verliererId: string): Promise<SerienStand> {
        const beendeteSerie = this.convertScoreToNumber(await redisService.get(PING_PONG_KEYS.serie(verliererId)) ?? 0);
        if (beendeteSerie > 0) {
            await redisService.delete(PING_PONG_KEYS.serie(verliererId));
        }

        const serie = await redisService.increment(PING_PONG_KEYS.serie(siegerId));
        const bisherigerRekord = this.convertScoreToNumber(await redisService.get(PING_PONG_KEYS.rekord(siegerId)) ?? 0);
        const istNeuerRekord = serie > bisherigerRekord;

        if (istNeuerRekord) {
            await redisService.set(PING_PONG_KEYS.rekord(siegerId), serie.toString());
        }

        // Rangliste bewusst bei JEDEM Sieg mitschreiben, nicht nur bei einem neuen Rekord: das
        // Sorted Set kam später dazu als die Einzelkeys, und so wandern die Bestandsrekorde nach
        // und nach von allein hinein, statt eine einmalige Migration per SCAN zu brauchen.
        // zAdd setzt den Wert, mehrfach mit demselben Rekord zu schreiben ist also folgenlos.
        await pingPongService.setRekordBestenliste(siegerId, Math.max(serie, bisherigerRekord));

        return {siegerId, verliererId, serie, istNeuerRekord: istNeuerRekord && serie >= MIN_SERIE, beendeteSerie};
    }

    async getSerie(userId: string): Promise<number> {
        return this.convertScoreToNumber(await redisService.get(PING_PONG_KEYS.serie(userId)) ?? 0);
    }

    // Kein Logging hier: der Score wird bei jedem Duell zweimal gelesen, und die Logs sind auf
    // Uberspace persistiert und über /config/logs einsehbar - das war reines Rauschen genau dort,
    // wo man im Problemfall nachsieht.
    async getScore(userId: string): Promise<number> {
        const score = await redisService.get(PING_PONG_KEYS.score(userId));

        if (!score) {
            return await this.updateScore(userId, 0);
        }
        return this.convertScoreToNumber(score);
    }

    async updateScore(userId: string, score: number): Promise<number> {
        const newScore: number = this.convertScoreToNumber(await redisService.set(PING_PONG_KEYS.score(userId), score.toString()))
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
        await redisService.setSortedSet(PING_PONG_KEYS.highscore, userId, newScore)
    }

    async handlePingPongHighscore(interaction: ChatInputCommandInteraction) {
        try {
            // 0-Punkte-Einträge raus: getScore legt jeden Duell-Teilnehmer im Sorted Set an, und wer
            // seine erste Partie nach dem Season-Reset verliert, steht dort mit 0 (der Abzug wird auf
            // 0 geklemmt). In einer Bestenliste haben solche Zeilen nichts zu suchen - waehleSieger
            // filtert aus demselben Grund.
            const highscore = (await redisService.getSortedSet(PING_PONG_KEYS.highscore)).filter(eintrag => eintrag.score > 0);
            // Die Liste nennt die laufende Season - sonst wundert sich am Monatsersten jemand
            // über die plötzlich leere Bestenliste.
            const ueberschrift = `**Bestenliste ${formatMonat(monatsSchluessel(new Date()))}**`;

            if (highscore.length === 0) {
                return interaction.reply(`${ueberschrift}\nNoch keine Punkte in dieser Season – fordert euch heraus!`);
            }

            const users = await Promise.all(
                highscore.map(item => userService.getUser(item.value))
            );
            const serien = await Promise.all(
                highscore.map(item => this.getSerie(item.value))
            );
            // Persönliches Emoji aus dem Morgengruß als kleines Erkennungszeichen vor dem Namen -
            // dieselbe Rangfolge wie beim Gruß (manuell > gelernt > abgeleitet), die Methode wirft
            // nie (Fallback für alle). Funktionales Item-Icon wie die Sport-Aktivitäts-Labels,
            // keine Dekoration.
            const emojis = await greetingHandler.holePersoenlicheEmojis(highscore.map(item => item.value));

            const message = highscore
                .map((item, index) => {
                    const user = users[index];
                    const displayName = user?.displayName ?? item.value;
                    const serie = serien[index] >= MIN_SERIE ? ` (${serien[index]} in Folge)` : '';
                    const emoji = emojiFuerNachricht(emojis[item.value], interaction.guild, item.value);
                    return `${index + 1}. ${emoji} ${displayName} - ${item.score}${serie}`;
                })
                .join('\n');

            // allowedMentions ist PFLICHT: die Zeilen tragen `displayName` aus den gespeicherten
            // Userdaten, und den setzt jede Person selbst. Ein Anzeigename wie `<@…>` würde sonst
            // bei jedem Aufruf der Bestenliste jemanden anpingen (Nutzer-Mentions brauchen dafür
            // keinerlei Sonderrechte). Hier ist keine einzige Mention gewollt, also alles aus -
            // dasselbe Muster wie in der Ruhmeshalle nebenan.
            return interaction.reply({
                content: `${ueberschrift}\n${message}\n`
                    + `Am Monatsende gewinnt Platz eins die Champion-Rolle, danach starten alle wieder bei 0 `
                    + `(frühere Sieger: \`/pingpong ruhmeshalle\`).`,
                allowedMentions: {parse: []},
            });
        } catch (error) {
            console.error("Error handling ping pong highscore:", error);
            return interaction.reply({ content: "Es gab einen Fehler beim Abrufen der Highscores.", flags: MessageFlags.Ephemeral });
        }
    }

    // Die längsten je erreichten Siegesserien - anders als die Bestenliste NICHT saisonal: der
    // Rekord überdauert sowohl die abgerissene Serie als auch den monatlichen Reset.
    async handleSerienrekorde(interaction: ChatInputCommandInteraction) {
        try {
            // Rekorde unter MIN_SERIE raus: eine "Serie" von 1 hat jede Person, die je ein Duell
            // gewonnen hat - das wären dieselben Karteileichen wie die 0-Punkte-Einträge in der
            // Bestenliste. Erzählt wird eine Serie ohnehin erst ab 2 (siehe formatSerie).
            const rekorde = (await pingPongService.getRekordBestenliste()).filter(eintrag => eintrag.score >= MIN_SERIE);
            const ueberschrift = '**Längste Siegesserien**';

            if (rekorde.length === 0) {
                return interaction.reply({
                    content: `${ueberschrift}\nNoch keine Serie von mindestens ${MIN_SERIE} Siegen – da ist die Bestmarke frei.`,
                    allowedMentions: {parse: []},
                });
            }

            const users = await Promise.all(rekorde.map(item => userService.getUser(item.value)));
            const emojis = await greetingHandler.holePersoenlicheEmojis(rekorde.map(item => item.value));

            const message = rekorde
                .map((item, index) => {
                    const displayName = users[index]?.displayName ?? item.value;
                    const emoji = emojiFuerNachricht(emojis[item.value], interaction.guild, item.value);
                    return `${index + 1}. ${emoji} ${displayName} - **${item.score}** Siege in Folge`;
                })
                .join('\n');

            // allowedMentions ist PFLICHT wie in der Bestenliste nebenan: die Zeilen tragen den
            // selbst gewählten `displayName`, ein Name wie `<@…>` würde sonst bei jedem Aufruf
            // jemanden anpingen.
            return interaction.reply({
                content: `${ueberschrift}\n${message}\n`
                    + `Die Bestmarke bleibt vom Monatswechsel unberührt – anders als die Punkte in \`/pingpong bestenliste\`.`,
                allowedMentions: {parse: []},
            });
        } catch (error) {
            console.error('Fehler beim Abrufen der Ping-Pong-Serienrekorde:', error);
            return interaction.reply({
                content: 'Die Serienrekorde konnten nicht abgerufen werden.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Ping-Pong-Befehle**\n\n` +
            `**/pingpong herausfordern** – Duell gegen eine andere Person: sie nimmt per Button an, `
            + `gespielt wird auf ${POINTS_TO_WIN} gewonnene Ballwechsel (Sieg +${DUELL_WIN}, Niederlage -${DUELL_LOSS}, nie unter 0)\n` +
            `**/pingpong ansageduell** – Wie das Duell, aber du sagst den eigenen Sieg vorher an: `
            + `gewinnst du, gibt es **+${ANSAGE_BONUS}** Punkt extra – verlierst du, kostet die große Klappe **${ANSAGE_MALUS}** Punkt zusätzlich\n` +
            `**/pingpong taktikduell** – Duell mit verdeckter Aktion: Schmetterball schlägt Lupfer, `
            + `Lupfer schlägt Konter, Konter schlägt Schmetterball (bei gleicher Wahl entscheidet der Ballwechsel)\n` +
            `**/pingpong rundlauf** – Rundlauf („Chinesisch") für mehrere: alle stellen sich per Button an die Platte, `
            + `dann fliegt Runde für Runde einer raus, bis die letzten beiden das Finale ausspielen. `
            + `Punkte nach Platzierung – die vorderen Plätze gewinnen, die hinteren zahlen drauf, `
            + `die beiden Finalisten bekommen **+${RUNDLAUF_FINAL_BONUS}** extra (mindestens ${MIN_RUNDLAUF}, höchstens ${MAX_RUNDLAUF} Leute)\n` +
            `**/pingpong doppel** – Doppel zu viert, ein Match auf ${POINTS_TO_WIN} gewonnene Ballwechsel: mit \`partner\` `
            + `spielt ihr als festes Team (Partner und optional \`gegner1\`/\`gegner2\` sagen per Button zu, freie Plätze `
            + `besetzt, wer zuerst klickt), ohne Partner lost der Bot die Teams aus, sobald vier dabei sind. `
            + `Punkte und Siegesserie pro Kopf wie im Duell\n` +
            `**/pingpong bestenliste** – Die Top 10 der laufenden Season, mit laufender Siegesserie\n` +
            `**/pingpong ruhmeshalle** – Die Champions der vergangenen Monate\n` +
            `**/pingpong serienrekorde** – Die längsten je erreichten Siegesserien (übersteht den Reset)\n` +
            `**/pingpong hilfe** – Zeigt diese Übersicht\n\n` +
            `**Seasons:** Die Punkte laufen monatsweise. Am Monatsende bekommt Platz eins die `
            + `Champion-Rolle (der bisherige Champion gibt sie ab) und einen Eintrag in der Ruhmeshalle, `
            + `danach starten alle wieder bei 0. Bei Punktgleichstand entscheidet das Los. `
            + `Siegesserie und persönlicher Rekord bleiben vom Reset unberührt.`
        );
    }
}

export default new PingPongHandler();
