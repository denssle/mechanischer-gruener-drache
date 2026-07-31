import {ChatInputCommandInteraction, MessageFlags} from 'discord.js';
import anstupserService from '../services/anstupser.service.js';
import {sendeDm} from '../services/dm.service.js';

// Täglicher 13:37-Anstupser als Abo (war README-Todo). Wer will, meldet sich SELBST an und bekommt
// dann jeden Tag um 13:37 (lokale Host-Zeit = Europe/Berlin) eine DM.
//
// Opt-in ist die tragende Design-Entscheidung: niemand wird ungefragt angeschrieben, und die
// DM-Schwäche (Discord verweigert Bot-DMs mit Fehler 50007, wenn "Direktnachrichten von
// Servermitgliedern" aus ist) trifft nur Leute, die sich aktiv angemeldet haben.
//
// Der DM-Versand selbst liegt in dm.service.ts (teilt ihn sich mit der Beobachtungsliste).

export const ANSTUPSER_TEXT = 'Er brauchts mal wieder';

// Uhrzeit der täglichen Runde (lokale Host-Zeit). Der 60-s-Timer in index.ts stupst nur an, die
// Prüfung passiert hier - deshalb reicht eine Konstante statt einer Cron-Dependency.
export const STUNDE = 13;
export const MINUTE = 37;

// Lokales Datum als YYYY-MM-DD (Host läuft auf Europe/Berlin) - Tagesmarker wie beim Sport-Feature.
export function formatTag(date: Date): string {
    const jahr = date.getFullYear();
    const monat = String(date.getMonth() + 1).padStart(2, '0');
    const tag = String(date.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
}

// Ist jetzt die Anstupser-Minute? Rein und getestet, damit die Zeitlogik ohne Timer prüfbar ist.
export function istAnstupserZeit(date: Date): boolean {
    return date.getHours() === STUNDE && date.getMinutes() === MINUTE;
}

export const ANSTUPSER_HILFE =
    `**Anstupser-Befehle**\n\n` +
    `**/anstupser an** – Täglich um 13:37 eine DM vom Bot bekommen\n` +
    `**/anstupser aus** – Keine DMs mehr\n` +
    `**/anstupser status** – Bin ich angemeldet?\n` +
    `**/anstupser hilfe** – Zeigt diese Übersicht\n\n` +
    `Rein freiwillig: der Bot schreibt nur an, wer sich selbst angemeldet hat. ` +
    `Damit die DM ankommt, müssen „Direktnachrichten von Servermitgliedern" in deinen ` +
    `Discord-Einstellungen erlaubt sein – beim Anmelden wird das direkt geprüft.`;

class AnstupserHandler {
    // Anmelden. Verschickt ZUERST eine Test-DM: kommt sie nicht an, wird gar nicht erst abonniert
    // und die Antwort sagt sofort Bescheid - sonst wartet jemand wochenlang still auf nichts.
    async handleAn(interaction: ChatInputCommandInteraction) {
        const zugestellt = await sendeDm(interaction.user.id, ANSTUPSER_TEXT, 'Anstupser');
        if (!zugestellt) {
            return interaction.reply({
                content: 'Ich kann dir gerade keine DM schicken – vermutlich sind deine ' +
                    'Direktnachrichten für Servermitglieder aus. Stell das in den Discord-' +
                    'Einstellungen um und versuch es nochmal; angemeldet habe ich dich noch nicht.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await anstupserService.abonniere(interaction.user.id);
        return interaction.reply({
            content: 'Angemeldet. Ab jetzt stupse ich dich täglich um 13:37 per DM an – ' +
                'die erste ist gerade unterwegs. Mit `/anstupser aus` wieder abmelden.',
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleAus(interaction: ChatInputCommandInteraction) {
        await anstupserService.kuendige(interaction.user.id);
        return interaction.reply({
            content: 'Abgemeldet. Ich stupse dich nicht mehr an.',
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleStatus(interaction: ChatInputCommandInteraction) {
        const abonniert = await anstupserService.istAbonniert(interaction.user.id);
        return interaction.reply({
            content: abonniert
                ? 'Du bist angemeldet – täglich um 13:37 kommt eine DM.'
                : 'Du bist nicht angemeldet. Mit `/anstupser an` meldest du dich an.',
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(ANSTUPSER_HILFE);
    }

    // Wird vom 60-s-Timer in index.ts angestupst und entscheidet selbst, ob wirklich etwas zu tun
    // ist. VERPASSTE TAGE WERDEN NICHT NACHGEHOLT (anders als beim Kilometerstand-Post): war der Bot
    // um 13:37 aus, ist ein Anstupser um 15 Uhr sinnlos - deshalb die harte Zeitprüfung VOR dem
    // Tagesmarker. Der Marker schützt nur davor, innerhalb derselben Minute doppelt zu senden.
    // Bewusst fehlertolerant, wie die anderen Timer-Aufgaben.
    async sendeAnstupser(): Promise<void> {
        try {
            const jetzt = new Date();
            if (!istAnstupserZeit(jetzt)) {
                return;
            }

            const heute = formatTag(jetzt);
            if (await anstupserService.getLastSentDay() === heute) {
                return;
            }
            // Den Tag beanspruchen, BEVOR gesendet wird: sonst könnte ein zweiter Timer-Durchlauf
            // während des Versands (viele DMs = dauert) dieselbe Runde erneut starten.
            await anstupserService.setLastSentDay(heute);

            const abonnenten = await anstupserService.holeAbonnenten();
            for (const userId of abonnenten) {
                // Pro Person eigenes Fangen: eine geschlossene DM darf die anderen nicht abbrechen.
                await sendeDm(userId, ANSTUPSER_TEXT, 'Anstupser');
            }
        } catch (error) {
            console.error('Fehler beim Verschicken der Anstupser:', error);
        }
    }
}

export default new AnstupserHandler();
