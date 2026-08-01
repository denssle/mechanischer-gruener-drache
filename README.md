# Mechanischer Grüner Drache 🐲

Ein Discord-Bot für den Discord-Server von [LotgD](http://www.lotgd.de/), geschrieben in TypeScript.

## 🚀 Features

- **Ping-Pong-Duell**: Man fordert eine andere Person heraus (`/pingpong herausfordern`), sie nimmt per Button an, dann wird gespielt – Sieg bringt einen Punkt, Niederlage kostet einen. Wer mehrere Duelle am Stück gewinnt, hat eine **Siegesserie** (mit persönlichem Rekord). Dazu zwei Varianten: das **Ansage-Duell** (angesagter eigener Sieg – geht er auf, ein Punkt extra, sonst einer weniger) und das **Taktikduell** (verdeckte Aktionen im Schere-Stein-Papier-Prinzip: Schmetterball/Konter/Lupfer). Anti-Spam-Cooldown und Bestenliste (`/pingpong bestenliste`) inklusive, gespeichert in Redis. Die Punkte laufen **monatsweise**: am Monatsende bekommt Platz eins die Champion-Rolle und einen Eintrag in der Ruhmeshalle (`/pingpong ruhmeshalle`), danach starten alle wieder bei 0 – so bleibt die Bestenliste nicht auf Dauer von Bestandsspielern zementiert.
- **Twitch-Integration**: User verknüpfen ihren eigenen Twitch-Kanal (`/twitch verknuepfen`); der Bot meldet per Webhook, wenn sie live gehen – inkl. Stream-Titel und Spiel/Kategorie. Der Gesundheitscheck dafür steckt im feature-übergreifenden `/diagnose` (Admin).
- **Sport-Tracking**: Bewusst kooperativ – alle tragen ihre Kilometer zu einer gemeinsamen Gesamtsumme bei (`/sport gesamt`), keine Rangliste. Eingetragen wird per `/sport eintragen` oder **automatisch**: eine Nachricht wie „+12 km gelaufen" im Sport-Kanal wird erkannt und still per Reaktion quittiert. **Meilensteine** (von Usern angelegt) werden beim Überschreiten der Schwelle im Ankündigungskanal gefeiert, und um Mitternacht postet der Bot täglich den gemeinsamen Kilometerstand.
- **User-Daten-Tracking**: Hält intern Namen und Rollen der Mitglieder aktuell (z.B. damit Live-Meldungen den richtigen Namen zeigen).
- **Nachrichten-Logging**: Postet bearbeitete/gelöschte Nachrichten (inkl. Massen-Löschungen), Server-Beitritte/-Austritte/-Kicks, Rollen- und Nickname-Änderungen, Timeouts/Mutes, Bans/Unbans sowie Änderungen an Rollen, Kanälen und Webhooks in einen konfigurierbaren Log-Channel – jeweils mit dem Urheber aus dem Audit-Log (Kanal über `/config` festlegen). Wer den Server verlässt und wiederkommt, wird gezählt – die Beitritts-Meldung sagt dann, das wievielte Mal es ist; die Austritts-Meldung nennt, wie lange die Person dabei war.
- **Rollen-Selbstvergabe**: Ein Admin postet mit `/rollenbutton` eine Nachricht mit einem Button; per Klick geben sich User selbst eine Rolle (nochmal klicken entfernt sie wieder), z.B. für die Regelakzeptanz oder Twitch-Benachrichtigungen. Der Bot braucht dafür "Rollen verwalten"-Rechte und muss in der Rollen-Hierarchie über der zu vergebenden Rolle stehen.
- **Event-Countdown**: Ein Admin legt den Termin des nächsten Community-Events über die Konfigurationsseite `/config` fest; alle können per `/event countdown` fragen, wie lange es noch dauert.
- **Spielwelt-Anbindung**: `/news` holt die neueste Spiel-News von [lotgd.de](https://www.lotgd.de/news.php), `/ereignisse` das Ingame-Ereignislog (wer wurde von wem getötet, wiederbelebt, blamiert …), `/online` zeigt, wer gerade im Spiel eingeloggt ist. Mit `/charakter` verknüpft man den eigenen LotGD-Charakter (nur der öffentliche Name, **keine Zugangsdaten**) – verknüpfte Charaktere werden in `/online` und `/ereignisse` hervorgehoben und dem Discord-User zugeordnet. Alles live per Scraping, ohne Login.
- **Drachentötungs-Gratulation**: Erlegt jemand mit verknüpftem Charakter im Spiel den Drachen, gratuliert der Bot im Spielwelt-Ankündigungskanal. Erkannt wird das am Stufen-Rücksturz auf 1 – und zwar mit den Daten, die `/online` und `/charakter anzeigen` ohnehin abrufen, also ohne zusätzliche Abfragen bei lotgd.de.
- **Blåhaj-Rechner**: Erwähnt jemand einen Euro-Betrag im Chat, rechnet der Bot aus, wie viele Blåhajs (IKEA-Hai, 28 €/Stück) man dafür bekäme, und summiert alle je erwähnten Beträge zu einer „Blåhaj-Fläche" in Hektar. Auf Abruf per `/blahaj`.
- **Roleplay-Suche**: Wer gerade Lust auf Roleplay hat, meldet sich mit `/rollenspiel suche` als suchend (Art: PbP, Live oder beides); `/rollenspiel suchende` zeigt alle, die gerade suchen, und `/rollenspiel beenden` nimmt einen wieder von der Liste. Bewusst simpel gehalten – keine Ablaufzeit, kein Kanal-Aushang.
- **Geburtstagskalender**: Wer mag, hinterlegt mit `/geburtstag setzen` den eigenen Geburtstag (**das Jahr ist freiwillig**); der Bot gratuliert am Tag morgens um 8 Uhr im dafür festgelegten Kanal – mit einer zufälligen Zeile aus einer Liste von Glückwunsch-Variationen, und nur mit Altersangabe, wenn ein Jahr hinterlegt ist. `/geburtstag liste` zeigt, wer als Nächstes dran ist. Eingetragen wird ausschließlich selbst, der Kanal wird über `/config` gesetzt.
- **Tipps & Nettigkeiten**: Selten (~15 %, höchstens einmal pro Person und Tag) hängt der Bot an eine ohnehin ausgelöste Antwort eine kleine, **nur für dich sichtbare** Zeile – meist ein Tipp zu einem Befehl, den man vielleicht noch nicht kennt, manchmal einfach ein netter Gruß.

## 💬 Befehle

Alle Befehle, Subcommands und Optionen sind deutsch benannt. Umlaute in den Namen sind bewusst als `ae/oe/ue` geschrieben (Discord erlaubt keine Umlaute in Command-Namen).

| Befehl | Beschreibung |
|---|---|
| `/pingpong herausfordern` | Fordert eine andere Person zu einem Duell heraus (sie nimmt per Button an) |
| `/pingpong ansageduell` | Duell mit angesagtem Sieg – geht die Ansage auf, gibt es einen Punkt extra, sonst kostet sie einen |
| `/pingpong taktikduell` | Duell mit verdeckter Aktion (Schmetterball/Konter/Lupfer entscheiden gegeneinander) |
| `/pingpong bestenliste` | Zeigt die Bestenliste der laufenden Season |
| `/pingpong ruhmeshalle` | Zeigt die Champions der vergangenen Monate |
| `/sport eintragen` | Sportliche Aktivität mit Kilometern eintragen |
| `/sport statistik` | Eigene Statistik pro Aktivität |
| `/sport gesamt` | Gemeinsame Gesamtkilometer aller Mitglieder |
| `/sport bearbeiten` · `/sport loeschen` | Eigenen Eintrag korrigieren bzw. löschen |
| `/sport meilenstein setzen` | Meilenstein für die gemeinsame Gesamtdistanz anlegen (für alle offen) |
| `/twitch verknuepfen` · `/twitch entfernen` · `/twitch status` | Eigenen Twitch-Kanal verknüpfen, entfernen, anzeigen |
| `/rollenbutton` | Nachricht mit Button posten, über den User sich selbst eine Rolle geben (Admin) |
| `/event countdown` | Zeigt, wie lange es noch bis zum Event dauert |
| `/news` | Holt die neueste Spiel-News von lotgd.de und postet sie |
| `/ereignisse` | Zeigt die neuesten Ingame-Ereignisse aus dem Spielgeschehen |
| `/online` | Zeigt, wer gerade im Spiel eingeloggt ist (plus die letzten 30 Minuten) |
| `/charakter verknuepfen` · `/charakter anzeigen` · `/charakter entfernen` | Eigenen LotGD-Charakter verknüpfen und dessen öffentliche Infos abrufen – inkl. ob er gerade im Spiel ist und wo (nur für dich sichtbar) |
| `/spielwelt` | Detail-Hilfe zu den Spielwelt-Befehlen (`/news`, `/ereignisse`, `/online`) |
| `/blahaj` | Rechnet einen Euro-Betrag (oder die Server-Gesamtsumme) in Blåhajs & Fläche um |
| `/rollenspiel suche` · `/rollenspiel suchende` · `/rollenspiel beenden` | Sich als Roleplay-suchend melden (PbP/Live/beides), Suchende anzeigen, wieder abmelden |
| `/geburtstag setzen` · `/geburtstag entfernen` · `/geburtstag status` | Eigenen Geburtstag hinterlegen (Jahr optional), löschen, anzeigen |
| `/geburtstag liste` | Zeigt die nächsten anstehenden Geburtstage |
| `/diagnose` | Gesundheits-/Konfigurationscheck aller Einstellungen (Admin) |
| `/hilfe` | Gesamtübersicht über alle Befehle des Bots |
| `/version` | Zeigt die aktuelle Bot-Version |

`/pingpong`, `/sport`, `/twitch`, `/event`, `/charakter`, `/rollenspiel` und `/geburtstag` haben zusätzlich je einen `hilfe`-Subcommand, der alle zugehörigen Befehle auflistet. `/hilfe` gibt eine Gesamtübersicht über alle Bereiche und Befehle.

Die Admin-**Einstellungen** werden nicht mehr per Slash-Befehl gesetzt, sondern über die **Web-Konfigurationsseite `/config`** (Discord-Login, nur Server-Admins): die Kanäle (Protokoll, Twitch-Benachrichtigung, Sport-Ankündigung, Morgengruß, Geburtstage, Spielwelt-Ankündigung) + Twitch-Benachrichtigungsrolle, der **Event-Termin**, die **Sport-Admin-Funktionen** (Kilometerstand eines Mitglieds setzen, Bestandskilometer, Meilensteine anzeigen/entfernen) sowie das **Auffrischen der persönlichen Morgengruß-Emojis** (Button „aus der Historie lernen"). Dafür entfallen sind `/protokoll`, `/twitch benachrichtigungskanal`/`benachrichtigungsrolle`, `/sport ankuendigungskanal`/`setzen`/`altkilometer`/`altkilometer-setzen`/`meilenstein liste`/`meilenstein entfernen`, `/morgengruss` (komplett – setzen **und** lernen liefen zusammen) und `/event setzen`/`entfernen`. Als Befehle bleiben u.a. `/event countdown` und `/sport meilenstein setzen` (bewusst für alle offen).

## 🛠 Architektur

Das Projekt folgt dem Prinzip der *Separation of Concerns*:

- **`src/commands`**: Definition der Slash-Commands für Discord.
- **`src/handlers`**: Steuerung der Logik und Reaktion auf Events (Discord Interactions, Twitch Webhooks).
- **`src/services`**: Infrastruktur-Logik (Redis-Datenbankzugriff, Twitch-API-Logik, Sport-Daten).
- **`src/server`**: Express-Server für den Empfang von Twitch-Webhooks.
- **`src/types`**: Zentrale Typ-Definitionen und Interfaces.

## 📦 Installation & Setup

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

2. **Konfiguration:**
   Erstelle eine `config.json` im Hauptverzeichnis (siehe `.gitignore`):
   ```json
   {
     "BOT_TOKEN": "DEIN_DISCORD_TOKEN",
     "CLIENT_ID": "DEIN_BOT_CLIENT_ID",
     "GUILD_ID": "DEINE_SERVER_ID",
     "TWITCH_WEBHOOK_SECRET": "DEIN_GEHEIMNIS",
     "TWITCH_CLIENT_ID": "DEINE_TWITCH_CLIENT_ID",
     "TWITCH_CLIENT_SECRET": "DEIN_TWITCH_CLIENT_SECRET"
   }
   ```
   `TWITCH_WEBHOOK_CALLBACK_URL` ist optional und muss nur gesetzt werden, wenn der Webhook nicht unter der Standard-URL in `twitch.service.ts` erreichbar ist.

   **Optional – Web-Konfigurationsseite (`/config`) mit Discord-Login:** Nur nötig, wenn die
   Verwaltungsseite genutzt werden soll. Drei zusätzliche Felder in der `config.json`:
   ```json
   {
     "DISCORD_CLIENT_SECRET": "OAUTH2_CLIENT_SECRET_AUS_DEM_PORTAL",
     "CONFIG_SESSION_SECRET": "ZUFALLSSTRING_ZUM_COOKIE_SIGNIEREN",
     "CONFIG_BASE_URL": "http://localhost:3000"
   }
   ```
   - `DISCORD_CLIENT_SECRET`: im [Discord Developer Portal](https://discord.com/developers/applications) unter **OAuth2 → Client Secret** generieren (nicht das Bot-Token!).
   - `CONFIG_SESSION_SECRET`: ein zufälliger String, z.B. `openssl rand -hex 32`.
   - `CONFIG_BASE_URL`: die öffentliche Basis-URL des Servers (Default `http://localhost:3000`); der Redirect ist `<CONFIG_BASE_URL>/config/callback`.
   - Im Portal unter **OAuth2 → Redirects** die Callback-URLs eintragen (lokal **und** produktiv), z.B. `http://localhost:3000/config/callback` und `https://enzlor.uber.space/config/callback`.
   - Nur wer auf dem Server **Administrator** ist, kommt auf `/config`. Fehlen die beiden Secrets, bleibt die Seite gesperrt (fail-closed).
   - Deployment-Hinweis (Uberspace): `/config` braucht ein eigenes Web-Backend-Mapping (`uberspace web backend`, analog zu `/twitch`), sonst ist der Pfad von außen nicht erreichbar.

3. **Befehle registrieren:**
   ```bash
   npm run build
   node dist/deploy-commands.js
   ```

4. **Bot starten:**
   ```bash
   npm start
   ```

## 🧪 Testing

### Automatisierte Tests
Wir nutzen **Vitest** für Unit- und Integrationstests. Diese werden auch bei jedem Push auf `main` via GitHub Actions ausgeführt.
```bash
npm test
```

Testabdeckung anzeigen (via `@vitest/coverage-v8`):
```bash
npm run test:coverage
```

### Typecheck
Type-Check inklusive der Testdateien – die sind bewusst nicht Teil von `npm run build` (keine `*.test.js` in `dist/`), Typfehler dort fallen also **nur** hier auf. Läuft in der CI als eigener Step:
```bash
npm run typecheck
```

### Twitch Integrationstest (automatisiert)
Um den Twitch-Webhook-Ablauf lokal automatisiert zu testen (startet intern den Server, sendet einen Test-Webhook und beendet den Server wieder):
```bash
npm run test:twitch
```

### Manueller Twitch-Webhook Test
Um den Webhook-Server lokal manuell zu testen:
1. Bot starten (`npm start`).
2. In einem neuen Terminal:
   ```bash
   npm run build:scripts
   node dist-scripts/test-twitch-webhook.js notify
   ```

## ✅ Fortschritt / Todo

Die offenen Ideen sowie die Historie der erledigten und verworfenen Punkte stehen in [TODO.md](TODO.md).
