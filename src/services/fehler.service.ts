import {DiscordAPIError} from 'discord.js';

// Kurzbeschreibung eines Fehlers fürs (persistierte) Log: Meldung plus Discord-Code und HTTP-Status,
// daran lässt sich ablesen, WAS schiefging (10007 = Mitglied unbekannt, 50001 = kein Zugriff, …).
// Bewusst nicht das ganze Fehlerobjekt: ein DiscordAPIError trägt den requestBody mit, also den
// Text, den der Bot gerade senden wollte - und der kann fremde Inhalte enthalten (siehe CLAUDE.md,
// Deployment: keine Nachrichteninhalte ins Log).
export function beschreibeFehler(error: unknown): string {
    if (error instanceof DiscordAPIError) {
        return `${error.message} (Discord-Code ${error.code}, HTTP ${error.status})`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

// Für `.catch(...)` an Stellen, die einen Fehler bewusst nicht weiterreichen (Ersatz-Antwort nach
// einem schon geloggten Fehler, Kanal nicht abrufbar, …): der Ablauf geht mit `null` weiter, aber
// der Grund landet im Log, statt still zu verschwinden. `kontext` sagt, was nicht ging und was
// daraus folgt, z.B. "Geburtstagskanal 123 nicht abrufbar, Glückwunsch wird zurückgestellt".
export function warneUndWeiter(kontext: string): (error: unknown) => null {
    return (error: unknown) => {
        console.warn(`${kontext}: ${beschreibeFehler(error)}`);
        return null;
    };
}
