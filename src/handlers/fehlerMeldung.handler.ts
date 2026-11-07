import {TextChannel} from 'discord.js';
import client from '../client.js';
import fehlerMeldungService from '../services/fehlerMeldung.service.js';

// Meldet console.error gesammelt in einen Admin-Kanal, damit ein Fehler auffällt, ohne dass jemand
// ins Log schaut. Gesendet wird nur aus dem 60-s-Timer, nie direkt beim Fehler: ein Fehler beim
// Melden erzeugt so keine Schleife. Aus demselben Grund loggt diese Datei nur per console.warn.
//
// Bewusst nur die ERSTE Zeile jedes Fehlers: Stacktraces gehören ins Log, und die Log-Regel "keine
// Nachrichteninhalte" soll auch hier nicht von der Länge einer Fehlermeldung abhängen.

// Höchstens eine Meldung in diesem Abstand. Bei einem Redis-Ausfall fällt sonst der Kanal voll.
export const MELDE_ABSTAND_MS = 10 * 60 * 1000;
export const MAX_ZEILEN = 5;
export const MAX_ZEILEN_LAENGE = 200;
// Obergrenze im Speicher: wer die Sammlung nie abholt (kein Kanal), soll nicht endlos wachsen.
const MAX_MERKEN = 20;

export function kuerzeFehler(text: string): string {
    const zeile = text.split('\n')[0].replaceAll('`', "'").trim();
    return zeile.length > MAX_ZEILEN_LAENGE ? `${zeile.slice(0, MAX_ZEILEN_LAENGE)} …` : zeile;
}

export function baueMeldung(fehler: Map<string, number>, seit: number): string {
    const gesamt = [...fehler.values()].reduce((summe, anzahl) => summe + anzahl, 0);
    const zeilen = [...fehler.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ZEILEN)
        .map(([text, anzahl]) => `${anzahl}× ${text}`);
    const rest = fehler.size - zeilen.length;

    return `**${gesamt} Fehler im Bot seit <t:${Math.floor(seit / 1000)}:R>**\n`
        + `\`\`\`\n${zeilen.join('\n')}\n\`\`\``
        + (rest > 0 ? `\n… und ${rest} weitere Arten.` : '')
        + `\nDetails stehen auf /config/logs.`;
}

class FehlerMeldungHandler {
    #offen = new Map<string, number>();
    #seit = 0;
    #letzteMeldung = 0;

    // Wird bei jedem console.error aufgerufen, muss also synchron und ohne Nebenwirkung bleiben.
    merke(text: string): void {
        const zeile = kuerzeFehler(text);
        if (!this.#offen.has(zeile) && this.#offen.size >= MAX_MERKEN) return;

        if (this.#offen.size === 0) this.#seit = Date.now();
        this.#offen.set(zeile, (this.#offen.get(zeile) ?? 0) + 1);
    }

    // Vom 60-s-Timer angestoßen. Scheitert das Senden, bleibt die Sammlung liegen und geht beim
    // nächsten Mal mit raus.
    async sendeSammlung(): Promise<void> {
        if (this.#offen.size === 0) return;
        if (Date.now() - this.#letzteMeldung < MELDE_ABSTAND_MS) return;

        try {
            const channelId = await fehlerMeldungService.getChannel();
            if (!channelId) {
                // Ohne Kanal will niemand die Meldung: nicht aufheben, sonst käme nach dem Setzen
                // des Kanals ein Schwung uralter Fehler.
                this.#offen.clear();
                return;
            }

            const channel = await client.channels.fetch(channelId) as TextChannel | null;
            if (!channel) return;

            await channel.send(baueMeldung(this.#offen, this.#seit));
            this.#offen.clear();
            this.#letzteMeldung = Date.now();
        } catch (error) {
            console.warn('Fehlermeldung konnte nicht in den Admin-Kanal:', error);
        }
    }

    // Nur für Tests.
    zuruecksetzen(): void {
        this.#offen.clear();
        this.#seit = 0;
        this.#letzteMeldung = 0;
    }
}

export default new FehlerMeldungHandler();
