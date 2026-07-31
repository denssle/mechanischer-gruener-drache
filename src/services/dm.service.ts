import client from '../client.js';

// Gemeinsamer DM-Versand für die Opt-in-Features (Anstupser-Abo, Beobachtungsliste). Stand
// vorher nur im Anstupser-Handler; mit dem zweiten Nutzer gehört er an eine Stelle - dieselbe
// Überlegung wie bei PING_PONG_KEYS im Ping-Pong-Service.
//
// client wird nur im Funktionskörper benutzt, nie auf Modul-Top-Level (Zirkular-Import-Falle).

// Discord-Fehlercode für "kann dieser Person keine DM schicken" (DMs zu, oder Bot blockiert).
export const DM_GESCHLOSSEN = 50007;

// Schickt eine DM und meldet, ob sie ankam. false statt Fehler, damit die Aufrufer sich darauf
// verlassen können, dass nichts durchschlägt: eine geschlossene DM darf weder eine Anmeldung
// noch eine laufende Rundmail an alle anderen abbrechen.
export async function sendeDm(userId: string, text: string, kontext: string): Promise<boolean> {
    try {
        const user = await client.users.fetch(userId);
        await user.send(text);
        return true;
    } catch (error) {
        const code = (error as { code?: number }).code;
        if (code === DM_GESCHLOSSEN) {
            // Kein Grund zur Aufregung: die Person hat ihre DMs zu. Nur vermerken - bewusst KEINE
            // automatische Abmeldung (Hobby-Scope; sie kann die DMs jederzeit öffnen).
            console.warn(`${kontext}-DM an ${userId} nicht zustellbar (DMs geschlossen).`);
        } else {
            console.error(`Fehler beim Senden der ${kontext}-DM an ${userId}:`, error);
        }
        return false;
    }
}
