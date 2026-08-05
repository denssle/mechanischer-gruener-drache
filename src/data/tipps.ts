// Reine Daten - die Auswahl-/Drossel-Logik steckt in services/tipp.service.ts.
// Jeder Tipp nennt genau einen Befehl und erklärt ihn in einem Satz; `befehl` ist der
// Top-Level-Command-Name, damit Tipps zu schon benutzten Befehlen ausgefiltert werden können.
export interface Tipp {
    befehl: string;
    text: string;
}

export const TIPPS: Tipp[] = [
    {befehl: 'charakter', text: 'Tipp: Mit `/charakter verknuepfen` hinterlegst du deinen LotGD-Charakter – danach wird dein Name in `/online` und `/ereignisse` hervorgehoben.'},
    {befehl: 'charakter', text: 'Tipp: `/charakter anzeigen` holt dir die öffentlichen Infos zu einem Charakter aus der Kriegerliste.'},
    {befehl: 'online', text: 'Tipp: `/online` zeigt dir, wer gerade im Spiel eingeloggt ist.'},
    {befehl: 'ereignisse', text: 'Tipp: `/ereignisse` zeigt, was zuletzt im Spiel passiert ist – wer wen erschlagen oder wiederbelebt hat.'},
    {befehl: 'news', text: 'Tipp: `/news` holt dir die neuesten Ankündigungen direkt von lotgd.de.'},
    {befehl: 'spielwelt', text: 'Tipp: `/spielwelt` erklärt dir alle Befehle rund um lotgd.de auf einmal.'},
    {befehl: 'sport', text: 'Tipp: Mit `/sport eintragen` zahlst du deine Kilometer auf die gemeinsame Gesamtstrecke ein – es gibt bewusst keine Rangliste.'},
    {befehl: 'sport', text: 'Tipp: `/sport gesamt` zeigt, wie weit der Server zusammen schon gekommen ist.'},
    {befehl: 'sport', text: 'Tipp: `/sport statistik` zeigt dir, was du bisher an Kilometern beigetragen hast.'},
    {befehl: 'sport', text: 'Tipp: Vertippt? `/sport bearbeiten` und `/sport loeschen` korrigieren deine eigenen Einträge.'},
    {befehl: 'sport', text: 'Tipp: Mit `/sport meilenstein setzen` legst du ein Ziel fest – der Bot feiert es, sobald wir es gemeinsam erreichen.'},
    {befehl: 'pingpong', text: 'Tipp: `/pingpong herausfordern` fordert jemanden zum Duell – Sieg bringt einen Punkt, Niederlage kostet einen.'},
    {befehl: 'pingpong', text: 'Tipp: `/pingpong bestenliste` zeigt, wer im Ping-Pong gerade vorn liegt.'},
    {befehl: 'event', text: 'Tipp: `/event countdown` verrät dir, wie lange es noch bis zum nächsten Treffen dauert.'},
    {befehl: 'twitch', text: 'Tipp: Mit `/twitch verknuepfen` sagt der Server Bescheid, wenn du live gehst.'},
    {befehl: 'blahaj', text: 'Tipp: `/blahaj` rechnet dir Euro-Beträge in Blåhajs um.'},
    {befehl: 'hilfe', text: 'Tipp: `/hilfe` zeigt dir alle Befehle auf einen Blick.'},
    {befehl: 'rollenspiel', text: 'Tipp: Mit `/rollenspiel suche` meldest du dich als suchend – `/rollenspiel suchende` zeigt, wer sonst noch Lust hat.'},
    {befehl: 'anstupser', text: 'Tipp: `/anstupser an` schickt dir täglich um 13:37 eine kurze Nachricht per DM – und `/anstupser aus` wieder ab.'},
    {befehl: 'geburtstag', text: 'Tipp: Mit `/geburtstag setzen` hinterlegst du deinen Geburtstag; das Jahr ist freiwillig, ohne es nennt der Glückwunsch kein Alter.'},
    {befehl: 'beobachten', text: 'Tipp: `/beobachten hinzufuegen` meldet dir per DM, wenn jemand im Spiel online geht – sofern er sich mit `/charakter beobachtbar` dafür freigegeben hat.'},
    {befehl: 'version', text: 'Tipp: `/version` verrät dir, welcher Stand des Bots gerade läuft.'},
];
