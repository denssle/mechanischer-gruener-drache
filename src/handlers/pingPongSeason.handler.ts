import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits} from "discord.js";
import redisService from "../services/redis.service.js";
import pingPongService, {PING_PONG_KEYS} from "../services/pingPong.service.js";
import client from "../client.js";
import config from "../../config.json" with {type: "json"};

// Season-Abrechnung des Ping-Pong-Features - bewusst eine eigene Datei neben pingPong.handler.ts
// (Duelle): die beiden teilen sich nur die Keys aus pingPong.service.ts, sonst nichts. client wird
// ausschließlich in Methodenkörpern benutzt (Zirkular-Import-Falle, der Handler ist über
// commands/index.js erreichbar).
// Die Punkte laufen monatsweise: am Monatswechsel bekommt Platz eins die Champion-Rolle und einen
// Ruhmeshallen-Eintrag, danach werden die Scores zurückgesetzt. Zweck ist, dass die Bestenliste
// nicht dauerhaft von Bestandsspielern zementiert wird. Angestoßen vom EINEN 60-s-setInterval in
// index.ts (kein zweiter Mechanismus, keine Cron-Dependency) - rechneSeasonAb entscheidet selbst
// anhand des Monatsmarkers, ob etwas zu tun ist.
//
// BEWUSSTES BALANCING: Der Ausgang eines Duells ist reiner Zufall, und eine Niederlage bei 0 Punkten
// kostet nichts (Clamp). Der Punktestand ist damit ein Random Walk mit Wand bei 0 - wer viel spielt,
// steht am Monatsende oben. Der Titel geht also im Wesentlichen an den Aktivsten, nicht an den
// Besten. Das ist so gewollt (Aktivität darf belohnt werden, 2026-07-29 entschieden); wer das je
// ändern will, dreht am ehesten an COOLDOWN_SECONDS oder wertet die Siegquote statt der Punkte.

const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// Monatsmarker in lokaler Zeit (Host = Europe/Berlin), wie alle anderen Tages-/Monatsmarker.
export function monatsSchluessel(datum: Date): string {
    return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}`;
}

// 'Juli 2026' aus '2026-07'. Unbekannte Formate bleiben unverändert stehen, statt zu scheitern
// (Muster: das englische Datum in parseGameEvents).
export function formatMonat(schluessel: string): string {
    const treffer = /^(\d{4})-(\d{2})$/.exec(schluessel);
    if (!treffer) {
        return schluessel;
    }
    const monat = MONATSNAMEN[Number(treffer[2]) - 1];
    return monat ? `${monat} ${treffer[1]}` : schluessel;
}

// Sieger einer Season aus dem Sorted Set. Bei Gleichstand entscheidet bewusst das Los - kein
// Tie-Break über Serie o.ä. (das wäre ein zweiter, schwer erklärbarer Maßstab). null = leere
// Season (niemand hat gespielt): kein Sieger, kein Eintrag, Rolle bleibt wie sie ist.
export function waehleSieger(eintraege: {value: string; score: number}[]): {userId: string; punkte: number} | null {
    const mitPunkten = eintraege.filter(eintrag => eintrag.score > 0);
    if (mitPunkten.length === 0) {
        return null;
    }

    const bestePunktzahl = Math.max(...mitPunkten.map(eintrag => eintrag.score));
    const gleichauf = mitPunkten.filter(eintrag => eintrag.score === bestePunktzahl);
    const gewaehlt = gleichauf[Math.floor(Math.random() * gleichauf.length)];

    return {userId: gewaehlt.value, punkte: gewaehlt.score};
}

class PingPongSeasonHandler {

    // Vom Minuten-Timer angestoßen: ist der Monat gewechselt, wird der Vormonat abgerechnet.
    // Ein verpasster Monatswechsel wird bewusst NACHGEHOLT (Muster Mitternachts-Kilometerstand,
    // nicht Anstupser) - ein Champion, der wegen eines Neustarts ausfällt, wäre ein echter Verlust.
    // Der Marker wird erst NACH dem Ruhmeshallen-Eintrag und dem Reset gesetzt: scheitert etwas
    // dazwischen, läuft die Abrechnung eine Minute später erneut.
    async rechneSeasonAb(): Promise<void> {
        const abgerechnet = await pingPongService.getLastSeason();
        const aktuellerMonat = monatsSchluessel(new Date());

        // Noch nie abgerechnet (frischer Deploy): Marker OHNE Abrechnung auf den laufenden Monat -
        // sonst würde ein Deploy am 30. sofort mitten im Monat abrechnen. Das steht bewusst HIER
        // und nicht in einem eigenen Init-Schritt beim Start: ein einmaliger Boot-Aufruf, der an
        // einem Redis-Hiccup scheitert, hätte den Marker dauerhaft leer gelassen - und mit ihm
        // liefe die Abrechnung nie wieder, still und unbemerkt.
        if (!abgerechnet) {
            await pingPongService.setLastSeason(aktuellerMonat);
            console.log(`Ping-Pong-Season initialisiert: laufender Monat ${aktuellerMonat}, keine Abrechnung.`);
            return;
        }

        if (abgerechnet === aktuellerMonat) {
            return;
        }

        const stand = await redisService.getSortedSetAll(PING_PONG_KEYS.highscore);
        const sieger = waehleSieger(stand);

        // Nur, wenn für den Monat noch kein Champion feststeht: bricht die Abrechnung mitten im
        // Reset ab (Redis-Hiccup), läuft sie eine Minute später erneut und fände nur noch die
        // Reste im Sorted Set - der echte Champion würde sonst still überschrieben.
        let eingetragen = false;
        if (sieger) {
            eingetragen = await pingPongService.addRuhmeshalleEintrag(abgerechnet, sieger.userId, sieger.punkte);
            console.log(eingetragen
                ? `Ping-Pong-Season ${abgerechnet} abgerechnet: ${sieger.userId} mit ${sieger.punkte} Punkten.`
                : `Ping-Pong-Season ${abgerechnet} war bereits eingetragen - Champion bleibt unverändert.`);
        } else {
            console.log(`Ping-Pong-Season ${abgerechnet} war leer - kein Champion.`);
        }

        await this.setzeScoresZurueck(stand.map(eintrag => eintrag.value));
        await pingPongService.setLastSeason(aktuellerMonat);

        // Erst ganz zum Schluss und bewusst fehlertolerant: ohne gesetzte/vergebbare Rolle darf
        // die Abrechnung nicht scheitern (dann bliebe die Season ewig offen). Steht der Champion
        // schon fest, wird die Rolle nicht an einen Übriggebliebenen weitergereicht.
        if (sieger && eingetragen) {
            await this.vergebeChampionRolle(sieger.userId);
        }
    }

    // Reset betrifft NUR den Score - Serie und Rekord bleiben unangetastet (der Rekord ist eine
    // persönliche Bestmarke, die laufende Serie hängt am Spielverhalten, nicht an der Season).
    // Der Score liegt doppelt: als Einzelkey je User UND im Sorted Set. Beides wird gelöscht statt
    // auf 0 gesetzt, sonst stünde die Bestenliste am Monatsanfang voller 0-Punkte-Karteileichen
    // (getScore legt den Einzelkey bei Bedarf ohnehin neu an).
    async setzeScoresZurueck(userIds: string[]): Promise<void> {
        for (const userId of userIds) {
            await redisService.delete(PING_PONG_KEYS.score(userId));
        }
        await redisService.delete(PING_PONG_KEYS.highscore);
    }

    // Die Rolle zeigt immer nur den AMTIERENDEN Champion: erst allen aktuellen Trägern abnehmen
    // (nicht nur dem gespeicherten Vormonatssieger - robuster, falls sie jemand von Hand bekommen
    // hat), dann dem neuen Sieger geben. Fehlt die Rolle, das Recht oder die Hierarchie, wird das
    // nur geloggt - genau deshalb prüft /diagnose diese drei Dinge mit.
    async vergebeChampionRolle(siegerId: string): Promise<void> {
        try {
            const rolleId = await pingPongService.getChampionRole();
            if (!rolleId) {
                console.warn('Ping-Pong-Season: keine Champion-Rolle konfiguriert - Auszeichnung entfällt.');
                return;
            }

            const guild = client.guilds.cache.get(config.GUILD_ID);
            const rolle = guild?.roles.cache.get(rolleId);
            if (!guild || !rolle) {
                console.warn(`Ping-Pong-Season: Champion-Rolle ${rolleId} existiert nicht (mehr).`);
                return;
            }

            const me = guild.members.me;
            if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
                console.warn('Ping-Pong-Season: mir fehlt das Recht "Rollen verwalten" - Champion-Rolle nicht vergeben.');
                return;
            }
            if (me.roles.highest.comparePositionTo(rolle) <= 0) {
                console.warn('Ping-Pong-Season: die Champion-Rolle steht über meiner in der Hierarchie - nicht vergeben.');
                return;
            }

            for (const traeger of rolle.members.values()) {
                if (traeger.id !== siegerId) {
                    await traeger.roles.remove(rolle).catch((error) => {
                        console.warn(`Konnte die Champion-Rolle nicht von ${traeger.id} entfernen:`, error);
                    });
                }
            }

            // Ist der Sieger nicht mehr auf dem Server, gibt es keine Rolle - der
            // Ruhmeshallen-Eintrag steht trotzdem schon.
            const sieger = await guild.members.fetch(siegerId).catch(() => null);
            if (!sieger) {
                console.warn(`Ping-Pong-Champion ${siegerId} ist nicht mehr auf dem Server - Rolle nicht vergeben.`);
                return;
            }
            await sieger.roles.add(rolle);
        } catch (error) {
            console.error('Fehler beim Vergeben der Ping-Pong-Champion-Rolle:', error);
        }
    }

    // Die Rolle zeigt immer nur den aktuellen Champion - ohne Ruhmeshalle verschwänden die
    // Vormonate spurlos. Bewusst KEIN Verkündungspost am Monatsende: wer es wissen will, fragt hier.
    // allowedMentions ist Pflicht, sonst pingt jede Abfrage sämtliche Ex-Champions.
    async handleRuhmeshalle(interaction: ChatInputCommandInteraction) {
        try {
            const eintraege = await pingPongService.getRuhmeshalle();

            if (eintraege.length === 0) {
                return interaction.reply({
                    content: 'Die Ruhmeshalle ist noch leer – die erste Season läuft gerade.',
                    allowedMentions: {parse: []},
                });
            }

            const zeilen = ['**Ping-Pong-Ruhmeshalle**'];
            for (const eintrag of eintraege) {
                const zeile = `${formatMonat(eintrag.monat)}: <@${eintrag.userId}> mit **${eintrag.punkte}** Punkten`;
                // Ganze Monate weglassen statt am Zeichenlimit abzuschneiden; in Redis bleiben sie.
                if ([...zeilen, zeile].join('\n').length > 1900) {
                    break;
                }
                zeilen.push(zeile);
            }

            return interaction.reply({content: zeilen.join('\n'), allowedMentions: {parse: []}});
        } catch (error) {
            console.error('Fehler beim Abrufen der Ping-Pong-Ruhmeshalle:', error);
            return interaction.reply({
                content: 'Die Ruhmeshalle konnte nicht abgerufen werden.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}

export default new PingPongSeasonHandler();
