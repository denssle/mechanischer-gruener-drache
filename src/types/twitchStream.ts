// Ausschnitt der Helix-"Get Streams"-Antwort (GET /streams?user_id=). Nur die Felder,
// die die Live-Meldung anreichern - Spiel/Kategorie und Stream-Titel.
export interface TwitchStream {
    game_id: string;
    game_name: string;
    title: string;
    type: string;
}
