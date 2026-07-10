// Gemeinsame Basis für alles LotGD-Scraping (news/online/character): lotgd.de liefert
// ISO-8859-1-kodiertes HTML (explizit dekodieren, sonst kaputte Umlaute) und blockt den
// Standard-Fetch-User-Agent mit 403 - der Bot-UA kommt durch.
export const LOTGD_BASE_URL = 'https://www.lotgd.de';

const USER_AGENT = 'MechanischerGruenerDrache-DiscordBot';

// Holt eine LotGD-Seite als dekodierten HTML-String. null bei nicht-ok Response (geloggt mit
// dem übergebenen Kontext, z.B. "News" oder "Kriegerliste Seite 2") - Fehlerbehandlung nach
// dem üblichen Muster: nie werfen lassen müssen die Aufrufer trotzdem nicht, Netzwerkfehler
// (fetch reject) reicht dieser Helper bewusst durch, die Services fangen sie in try/catch.
export async function fetchLotgdHtml(url: string, context: string): Promise<string | null> {
    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
        console.error(`Fehler beim Abrufen der LotGD-Seite (${context}): ${response.status} ${response.statusText}`);
        return null;
    }

    const buffer = await response.arrayBuffer();
    return new TextDecoder('iso-8859-1').decode(buffer);
}
