# Mechanischer Grüner Drache 🐲

Ein Discord-Bot für den Discord-Server von [LotgD](http://www.lotgd.de/), geschrieben in TypeScript.

## 🚀 Features

- **Ping-Pong-Duell**: Man fordert eine andere Person heraus (`/pingpong herausfordern`), sie nimmt per Button an, dann wird gespielt – Sieg bringt einen Punkt, Niederlage kostet einen. Wer mehrere Duelle am Stück gewinnt, hat eine **Siegesserie** (mit persönlichem Rekord). Dazu zwei Varianten: das **Ansage-Duell** (angesagter eigener Sieg – geht er auf, ein Punkt extra, sonst einer weniger) und das **Taktikduell** (verdeckte Aktionen im Schere-Stein-Papier-Prinzip: Schmetterball/Konter/Lupfer). Anti-Spam-Cooldown und Bestenliste (`/pingpong bestenliste`) inklusive, gespeichert in Redis.
- **Twitch-Integration**: User verknüpfen ihren eigenen Twitch-Kanal (`/twitch verknuepfen`); der Bot meldet per Webhook, wenn sie live gehen – inkl. Stream-Titel und Spiel/Kategorie. Admin-Diagnose via `/twitch diagnose`.
- **Sport-Tracking**: Bewusst kooperativ – alle tragen ihre Kilometer zu einer gemeinsamen Gesamtsumme bei (`/sport gesamt`), keine Rangliste. Eingetragen wird per `/sport eintragen` oder **automatisch**: eine Nachricht wie „+12 km gelaufen" im Sport-Kanal wird erkannt und still per Reaktion quittiert. **Meilensteine** (von Usern angelegt) werden beim Überschreiten der Schwelle im Ankündigungskanal gefeiert, und um Mitternacht postet der Bot täglich den gemeinsamen Kilometerstand.
- **User-Daten-Tracking**: Hält intern Namen und Rollen der Mitglieder aktuell (z.B. damit Live-Meldungen den richtigen Namen zeigen).
- **Nachrichten-Logging**: Postet bearbeitete/gelöschte Nachrichten (inkl. Massen-Löschungen), Server-Beitritte/-Austritte, Rollen- und Nickname-Änderungen, Timeouts/Mutes sowie Bans/Unbans in einen konfigurierbaren Log-Channel (`/protokoll`). Wer den Server verlässt und wiederkommt, wird gezählt – die Beitritts-Meldung sagt dann, das wievielte Mal es ist.
- **Rollen-Selbstvergabe**: Ein Admin postet mit `/rollenbutton` eine Nachricht mit einem Button; per Klick geben sich User selbst eine Rolle (nochmal klicken entfernt sie wieder), z.B. für die Regelakzeptanz oder Twitch-Benachrichtigungen. Der Bot braucht dafür "Rollen verwalten"-Rechte und muss in der Rollen-Hierarchie über der zu vergebenden Rolle stehen.
- **Event-Countdown**: Ein Admin legt den Termin des nächsten Community-Events fest (`/event setzen`); alle können per `/event countdown` fragen, wie lange es noch dauert.
- **Spielwelt-Anbindung**: `/news` holt die neueste Spiel-News von [lotgd.de](https://www.lotgd.de/news.php), `/ereignisse` das Ingame-Ereignislog (wer wurde von wem getötet, wiederbelebt, blamiert …), `/online` zeigt, wer gerade im Spiel eingeloggt ist. Mit `/charakter` verknüpft man den eigenen LotGD-Charakter (nur der öffentliche Name, **keine Zugangsdaten**) – verknüpfte Charaktere werden in `/online` und `/ereignisse` hervorgehoben und dem Discord-User zugeordnet. Alles live per Scraping, ohne Login.
- **Blåhaj-Rechner**: Erwähnt jemand einen Euro-Betrag im Chat, rechnet der Bot aus, wie viele Blåhajs (IKEA-Hai, 28 €/Stück) man dafür bekäme, und summiert alle je erwähnten Beträge zu einer „Blåhaj-Fläche" in Hektar. Auf Abruf per `/blahaj`.
- **Tipps & Nettigkeiten**: Selten (~15 %, höchstens einmal pro Person und Tag) hängt der Bot an eine ohnehin ausgelöste Antwort eine kleine, **nur für dich sichtbare** Zeile – meist ein Tipp zu einem Befehl, den man vielleicht noch nicht kennt, manchmal einfach ein netter Gruß.

## 💬 Befehle

Alle Befehle, Subcommands und Optionen sind deutsch benannt. Umlaute in den Namen sind bewusst als `ae/oe/ue` geschrieben (Discord erlaubt keine Umlaute in Command-Namen).

| Befehl | Beschreibung |
|---|---|
| `/pingpong herausfordern` | Fordert eine andere Person zu einem Duell heraus (sie nimmt per Button an) |
| `/pingpong ansageduell` | Duell mit angesagtem Sieg – geht die Ansage auf, gibt es einen Punkt extra, sonst kostet sie einen |
| `/pingpong taktikduell` | Duell mit verdeckter Aktion (Schmetterball/Konter/Lupfer entscheiden gegeneinander) |
| `/pingpong bestenliste` | Zeigt die Ping-Pong-Bestenliste |
| `/sport eintragen` | Sportliche Aktivität mit Kilometern eintragen |
| `/sport statistik` | Eigene Statistik pro Aktivität |
| `/sport gesamt` | Gemeinsame Gesamtkilometer aller Mitglieder |
| `/sport bearbeiten` · `/sport loeschen` | Eigenen Eintrag korrigieren bzw. löschen |
| `/sport setzen` | Kilometerstand eines Mitglieds direkt setzen (Admin) |
| `/sport altkilometer` | Bestandskilometer ohne zugeordnetes Mitglied addieren (Admin) |
| `/sport altkilometer-setzen` | Bestandskilometer auf einen Wert setzen; `0` entfernt sie (Admin) |
| `/sport meilenstein setzen` | Meilenstein für die gemeinsame Gesamtdistanz anlegen (für alle offen) |
| `/sport meilenstein liste` · `/sport meilenstein entfernen` | Meilensteine anzeigen bzw. entfernen (Admin) |
| `/sport ankuendigungskanal` | Kanal für Meilensteine, Mitternachts-Post & Auto-Erfassung festlegen (Admin) |
| `/twitch verknuepfen` · `/twitch entfernen` · `/twitch status` | Eigenen Twitch-Kanal verknüpfen, entfernen, anzeigen |
| `/twitch benachrichtigungskanal` · `/twitch benachrichtigungsrolle` | Ziel-Kanal & Ping-Rolle für Live-Meldungen (Admin) |
| `/twitch diagnose` | Kanal, Rolle & EventSub-Subscriptions prüfen + Testnachricht (Admin) |
| `/rollenbutton` | Nachricht mit Button posten, über den User sich selbst eine Rolle geben (Admin) |
| `/protokoll` | Kanal fürs Nachrichten-/Audit-Logging festlegen (Admin) |
| `/event setzen` · `/event entfernen` | Termin des Community-Events festlegen/entfernen (Admin) |
| `/event countdown` | Zeigt, wie lange es noch bis zum Event dauert |
| `/news` | Holt die neueste Spiel-News von lotgd.de und postet sie |
| `/ereignisse` | Zeigt die neuesten Ingame-Ereignisse aus dem Spielgeschehen |
| `/online` | Zeigt, wer gerade im Spiel eingeloggt ist (plus die letzten 30 Minuten) |
| `/charakter verknuepfen` · `/charakter anzeigen` · `/charakter entfernen` | Eigenen LotGD-Charakter verknüpfen und dessen öffentliche Infos abrufen |
| `/spielwelt` | Detail-Hilfe zu den Spielwelt-Befehlen (`/news`, `/ereignisse`, `/online`) |
| `/blahaj` | Rechnet einen Euro-Betrag (oder die Server-Gesamtsumme) in Blåhajs & Fläche um |
| `/hilfe` | Gesamtübersicht über alle Befehle des Bots |
| `/version` | Zeigt die aktuelle Bot-Version |

`/pingpong`, `/sport`, `/twitch`, `/event` und `/charakter` haben zusätzlich je einen `hilfe`-Subcommand, der alle zugehörigen Befehle auflistet. `/hilfe` gibt eine Gesamtübersicht über alle Bereiche und Befehle.

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

### Offen

- [ ] Den Bot generalisieren für jeden Server (Multi-Guild-Plan: `docs/multi-guild-plan.md`)
- Mit dem eigentlichen Spiel interagieren (Machbarkeitsnotiz + Stufen: `docs/spiel-interaktion-idee.md`):
  - [x] **Stufe 1 – öffentliche Spielinfos (read-only):** `/news`, `/ereignisse`, `/online`, `/charakter` – alles per Scraping ohne Login, keiner der Auth-/Schreib-Blocker greift
  - [ ] ~~**Stufe 2 – persönliche Leseabfragen pro User (eingeloggt)**~~ – **geprüft und verworfen (2026-07-11).** Es gibt bei lotgd.de kein Token, das hinterlegbar, langlebig *und* harmlos ist: das Passwort bzw. sein md5-Hash ist login-äquivalent, der `lgi`-Cookie ist bloß eine Browser-Kennung (wird auch anonymen Besuchern gesetzt, enthält keine Session), und `PHPSESSID` verfällt nach **15 Minuten Leerlauf** (`LOGINTIMEOUT`). Es künstlich am Leben zu halten würde den User dauerhaft als „online" im Spiel erscheinen lassen und mit seiner echten Browser-Sitzung kollidieren. Sauber ginge nur ein vom Betreiber ausgestelltes Read-Only-Token – das existiert nicht. Herleitung: `docs/spiel-interaktion-idee.md`
  - [ ] **Stufe 3 – Aktionen im Spiel (schreibend, pro User):** Session **und** Nonce/CSRF-Handling **und** echter Spielschaden bei Fehlern (Kämpfe/Käufe/verbrauchte Züge) – der teuerste, riskanteste Teil, nur sehr vorsichtig
- [ ] Beobachtungsliste für Spiel-Charaktere: Man kann eine Liste von LotGD-Charakternamen hinterlegen; geht einer davon im Spiel online, kommt eine Benachrichtigung. Datenquelle ist die schon gescrapte `/online`-Liste (`list.php`), es gibt keine Push-API – also braucht es ein periodisches Polling (im gewählten Intervall den Roster/Online-Stand abrufen, Neu-Erscheinungen gegen die hinterlegte Liste abgleichen, nur beim Übergang offline→online melden, nicht wiederholt). **Die Scheduling-Grundlage existiert seit dem Mitternachts-Post** (`setInterval` 60 s in `index.ts`, Handler entscheidet selbst per Redis-Marker – siehe „Erledigt") – fürs Polling wiederverwenden, keinen zweiten Mechanismus bauen. **Zwei offene Design-Punkte:** (1) wohin die Benachrichtigung geht (fester Kanal per Admin-Command vs. DM an die Person, die den Namen hinterlegt hat) und (2) Scope (serverweite Liste vs. pro User) – beides vor dem Bau festlegen. Übergangs-State (wer war zuletzt online) muss in Redis liegen, sonst meldet jeder Poll-Durchlauf denselben Spieler erneut
- [ ] Discord-Ping bei neuer Ingame-Nachricht: Bekommt ein verknüpfter User im Spiel eine neue Nachricht (LotGD-Mail), soll er auf Discord einen Ping bekommen (naheliegend als **DM** an die Person, denn Mail ist privat – nicht in einen öffentlichen Kanal). **Blockiert durch Stufe 2** (persönliche Leseabfragen pro eingeloggtem User): der Mail-Stand ist **privat**, also nur hinter Login abrufbar – genau der Auth-Weg, der oben mangels hinterlegbarem/langlebigem/harmlosem Token verworfen ist. Geht also erst, wenn es eine saubere Spiel-Verbindung gibt (idealerweise ein vom Betreiber ausgestelltes Read-Only-Token, oder über das noch offene LotGD-Modul). **Wenn möglich:** wie bei der Beobachtungsliste gibt es keine Push-API → periodisches Polling des Mail-Stands pro User (Anzahl/Betreff/letzte Mail-ID), nur beim **Übergang „nichts Neues → neue Mail"** pingen, nicht wiederholt. Zuletzt-gesehenen Stand pro User in Redis halten, sonst pingt jeder Poll-Durchlauf erneut. Scheduling-Grundlage (`setInterval` 60 s in `index.ts`) und das Polling-Muster von der Beobachtungsliste mitbenutzen, keinen zweiten Mechanismus bauen. Herleitung/Stufen: `docs/spiel-interaktion-idee.md`
- [ ] Verwaltungs-/Einstellungsseite: Eine (Web-)Oberfläche, über die man die Einstellungen vornehmen kann, die aktuell nur über Admin-Befehle gehen (u.a. `/twitch benachrichtigungskanal`/`benachrichtigungsrolle`, `/sport ankuendigungskanal`/`setzen`/`altkilometer`/`altkilometer-setzen`, `/sport meilenstein` (Admin-Teile: `liste`/`entfernen`), `/protokoll kanal`, `/event setzen`/`entfernen`). Vermutlich als Erweiterung des schon existierenden Webhook-Servers (`src/server/`, Port 3000, Express 5) – die Werte liegen ohnehin alle in Redis, es bräuchte v.a. Lese-/Schreib-Views darauf. Zusätzliche Routen sind unkritisch, aber **zwei Infra-Details beachten:** (1) die `express.raw`-Middleware ist aktuell nur auf `/twitch` gemountet – eine HTML/Form-Seite braucht eigene Routen samt Body-Parser, ohne den Twitch-Raw-Pfad anzufassen; (2) auf Uberspace braucht der neue Pfad ein **eigenes Web-Backend-Mapping** (`uberspace web backend`, analog zu `/twitch`), sonst ist er von außen nicht erreichbar. **Offen und heikel:** Authentifizierung (der Server ist öffentlich erreichbar – für den Hobby-Scope zuerst prüfen, ob ein geteiltes Secret reicht, bevor Discord-OAuth erwogen wird; auf Server-Admins beschränken) und ob sich der Zusatzaufwand für einen kleinen Privatserver lohnt, auf dem die Admins die Slash-Befehle kennen. Proportionalität prüfen, bevor gebaut wird
- [ ] Idee (Tour 2026-07-12): **Drachentötungs-Gratulation ohne Polling.** Einen Dragonkill-Zähler gibt es öffentlich **nicht** (die Kriegerliste hat nur Gilde/Name/Ort/Level/Rasse/Geschlecht/Lebt/„Zuletzt da"), aber einen sauberen Proxy: nach einer Drachentötung fällt der Charakter von Level 15 (Max-Level, danach ist der Drache fällig) auf **Level 1** zurück – ein Level-**Sturz** ist also praktisch immer ein Drachenkill. Umsetzung: pro verknüpftem Charakter das zuletzt gesehene Level in Redis merken und beim ohnehin stattfindenden Abruf vergleichen (`/charakter` = volles Roster, `/online` hat ebenfalls eine Level-Spalte und erhöht die Trigger-Häufigkeit; **bestätigt: beide Services parsen die Level-Spalte bereits** – `cells[3]` in `online.service.ts`/`character.service.ts`, kommt aber als String, also `parseInt` nötig); Sturz → Gratulation posten. **Schwellenlogik vorab festlegen:** „Sturz auf genau Level 1" ist eindeutiger als „irgendein Rückgang" (Level kann auch durch Tod/andere Effekte schwanken) – der Drachenkill setzt von Level 15 auf 1 zurück. Opportunistische Erkennung statt Cron, Verzögerung von Stunden/Tagen ist bei einer Gratulation egal. Randfall bewusst hingenommen: gelöschter + neu erstellter Charakter mit gleichem Namen würde fälschlich gefeiert. Offen: welcher Kanal (eigener Admin-Subcommand `/charakter ankuendigungskanal` oder den Sport-Ankündigungskanal mitbenutzen? – das entscheidet den halben Aufwand)
- Ideen fürs LotGD-Modul, **bewusst zurückgestellt bis das Modul von den Betreibern abgenommen ist** (Feld-Existenz gegen den Referenzcode `lib/all_tables.php` geprüft):
  - [ ] Whitelist-Erweiterung `turns` (verbleibende Waldkämpfe heute – beantwortet „lohnt es sich, heute noch reinzuschauen?") – am besten direkt beim Betreiber-Review ansprechen, die Whitelist wird dort einmal verhandelt
  - [ ] Whitelist-Erweiterung `deathpower` (Gefallen beim Totengott Ramius) – tote Charaktere könnten dann statt nur „(tot)" zeigen: „wartet im Land der Schatten, hat X Gefallen bei Ramius" (passt zum Toten-Flavor-Todo oben)
  - [ ] Optional: `resurrections` + `age` (Wiederauferstehungen, Spieltage) als Flavor-Statistik
  - [ ] Globales Feld `secondsToNextGameDay` in der API-Antwort (kein Personenbezug): der Kern hat `secondstonextgameday()` in `lib/datetime.php` fertig – damit würde der verworfene **Neuer-Tag-Countdown** doch möglich („der neue Tag bricht in 2 h an, dann füllt sich der Wald wieder")
  - [ ] Vorab unabhängig prüfbar (braucht **kein** Modul): zeigt `about.php` auf lotgd.de die Tageszeit-Infos (`dayduration`/Sekunden bis zum neuen Tag) **öffentlich** an? Laut Referenzcode (`lib/about/about_setup.php`) stünde es dort – dann ginge der Countdown schon heute per Scraping
  - [ ] Nach Live-Gang: Drachentötungs-Gratulation (Todo oben) auf API-Daten umstellen – exakte Zahlen statt Roster-Scraping, gleiches opportunistisches Muster ohne Polling

### Erledigt

- [x] **Allgemeine `/diagnose` (Admin)** statt nur `/twitch diagnose`: feature-übergreifender Gesundheits-/Konfigurations-Check – zeigt je Einstellung nicht gesetzt / gesetzt-aber-nicht-abrufbar / ok für Twitch-Benachrichtigungskanal + -rolle (plus EventSub-Subscriptions nach Status), Sport-Ankündigungskanal, Protokoll-Kanal, Morgengruß-Kanal und ob ein Event gesetzt ist. Prüft außerdem die **verknüpften LotGD-Charaktere** gegen das Roster (verwaiste Links durch umbenannte/gelöschte Charaktere aufspüren). Ersetzt `/twitch diagnose` ganz; die frühere Testnachricht fiel bewusst weg (kein Kanal-Spam). `diagnose.handler.ts`, ephemer, `client.channels.fetch`-Abrufbarkeitsprüfung, Twitch-/Charakter-Teil fehlertolerant
- [x] **Morgengruß-Tradition:** Die erste Nachricht des Tages im per `/morgengruss kanal:<#channel>` (Admin) gesetzten Kanal wird vom Bot nur per Reaktion begrüßt (👋 + persönliches Emoji – kein eigener Post). Doppelgruß-Schutz per Redis-Tagesmarker `GREETING:LAST_DAY`. **Persönliches Emoji zweistufig:** aus der Chat-Historie **gelernt** (welches Emoji lag bei früheren Begrüßungen neben dem 👋 – `GREETING:EMOJI`), gescannt beim Kanal-Setzen und per `/morgengruss lernen` (Admin); Fallback ist ein aus der User-ID abgeleitetes Pool-Emoji. Auto-Listener `greeting.handler.ts`, `werteReaktionenAus`/`ableiteEmoji` exportiert + getestet
- [x] Idee (Wyrmland-Erkundungstour 2026-07-12): `/online` nach **Stadt gruppieren** – die eingeloggten Spieler stehen jetzt unter einer Stadt-Überschrift (`__Romar__ (2)`), Gruppen nach Größe absteigend sortiert (belebte Städte zuerst), bei Gleichstand alphabetisch. Nutzt die ohnehin geparste Ort-Spalte, kein zusätzlicher Fetch. Der Ort fiel dafür aus der einzelnen Spielerzeile raus (`groupByCity` in `online.handler.ts`, exportiert + getestet)
- [x] Idee (Tour 2026-07-12): **Toten-Flavor** in `/charakter anzeigen` – tote Charaktere bekommen statt nur „tot" eine zufällige lore-stimmige Zeile aus `TOTEN_FLAVORS` (`character.handler.ts`, exportiert + getestet), inkl. der Ramius-/Neuer-Tag-Wiederauferstehung
- [x] Sport: Postet jede Nacht um Mitternacht automatisch den gemeinsamen Kilometerstand in den Sport-Ankündigungskanal (`SPORT:ANNOUNCEMENT_CHANNEL`). Da es keine Scheduling-Mechanik im Projekt gab, per `setInterval` (60 s) in `index.ts` gelöst statt neuer Dependency – der Handler entscheidet über einen Redis-Tagesmarker (`SPORT:LAST_DAILY_POST`, `YYYY-MM-DD`) selbst, ob wirklich gepostet wird (Doppelpost-Schutz, holt einen wegen Ausfall verpassten Tag nach). Beim ersten Deploy kein Überraschungs-Post (`initTaeglicherPost` setzt den Marker ohne Post), erste echte Meldung also zur nächsten Mitternacht. Kanal-Abruf mit der Meilenstein-Ankündigung geteilt (`holeAnkuendigungskanal`), fehlertolerant
- [x] Architektur-Refactoring & Typsicherheit
- [x] Redis-Anbindung (stabilisiert)
- [x] Twitch-Integration & Webhook-Server
- [x] Umfangreiche Testabdeckung
- [x] Logging (`/protokoll`): Nachrichten-Edits/-Deletes inkl. Massen-Löschungen, Beitritt/Austritt, Rollen-, Nickname- & Timeout-Änderungen, Bans/Unbans
- [x] Rollen-Selbstvergabe (Button-Rollen via `/rollenbutton`)
- [x] Sport: Summe der Kilometer bearbeitbar (`/sport bearbeiten` für eigene Einträge, `/sport setzen` als Admin-Korrektur)
- [x] Sport: Bestandskilometer korrigier-/entfernbar (`/sport altkilometer-setzen`, `0` = entfernen)
- [x] Countdown bis zum Community-Event (`/event setzen` / `/event countdown`)
- [x] News aus dem Game anzeigen (`/news`, live von https://www.lotgd.de/news.php)
- [x] Hilfetexte ausbauen: jeder Gruppen-Command hat ein eigenes `hilfe` (`/sport`, `/twitch`, `/event`), plus eine allgemeine Gesamt-Hilfe `/hilfe` über alle Befehle
- [x] Admin Funktionen aus den Hilfetexten entfernen - die Listen werden zu lang
- [x] Tipps zu Funktionen einstreuen (Idee: Ladebildschirme in Videospielen) – umgesetzt als **ephemere Zeile** unter einer ohnehin ausgelösten Antwort, nicht als eigener Post im Channel: ~15 % Chance, max. **ein** Tipp pro Person und Tag, nie an ephemeren Antworten (Fehler/Cooldown/Admin-Quittungen) und nicht an `/hilfe`/`/spielwelt`. Rund jede dritte Zeile ist statt eines Tipps eine kleine Nettigkeit
- [x] Ping-Pong: **komplett auf PvP umgestellt** (`/pingpong herausfordern gegner:@user`) – Match gegen eine andere Person, sie nimmt per Button an; gespielt wird auf 3 gewonnene Ballwechsel, Sieg +1 / Niederlage -1 (nie unter 0). Das Solo-Spiel gegen den Bot wurde dabei **entfernt**: Punkte kommen jetzt ausschließlich aus echten Duellen, was die alte Design-Schwäche (Bestenliste belohnt viel Klicken statt Spielen) an der Wurzel behebt. `/pingpong` ist dafür ein Gruppen-Command (`herausfordern`/`bestenliste`/`hilfe`), `/pingbestenliste` ist entfallen
- [x] Twitch-Live-Meldung um Spiel & Kategorie erweitert (`twitchService.getStreamInfo` via Helix `Get Streams`, mit Fallback falls beim Live-Gehen noch nichts verfügbar ist)
- [x] Tipps nur noch zu Befehlen zeigen, die die Person **noch nie** benutzt hat – jede Command-Ausführung landet als Befehlsname in einem Redis-Set pro User (`TIPP:USED_COMMANDS:<userId>`, keine Argumente/Inhalte, siehe `docs/datenhaltung.md`); kennt jemand schon alle Tipp-Befehle, gibt es stattdessen eine Nettigkeit. Bestandsnutzer starten mit leerem Set, die Zählung beginnt ab Inbetriebnahme
- [x] **Taktikduell** (`/pingpong taktikduell gegner:@user aktion:<Schmetterball|Konter|Lupfer>`) als eigener Befehl neben dem normalen Duell: Beide Seiten wählen verdeckt eine Aktion, die Kombination entscheidet (Schere-Stein-Papier im Ringschluss – **Schmetterball schlägt Lupfer, Lupfer schlägt Konter, Konter schlägt Schmetterball**). Wählen beide dasselbe, entscheidet wie gehabt der 50/50-Ballwechsel. Der Herausforderer wählt seine Aktion als Option, der Herausgeforderte per Klick auf einen von drei Aktions-Buttons (+ Ablehnen) – die Wahl steckt in der `customId`, also **kein Redis, Neustart-fest**. Punkte und Siegesserie laufen wie beim normalen Duell. Bewusst hingenommen: im Client ist die verdeckte Wahl unsichtbar, technisch Versierte könnten sie aus dem API-Payload lesen – für eine Community-Spielerei okay
- [x] **Ansage-Duell** (`/pingpong ansageduell gegner:@user`) als eigener Befehl neben dem normalen `/pingpong herausfordern`: Der Herausforderer kündigt mit dem Befehl den **eigenen Sieg** an – va banque. Gespielt wird weiter rein zufällig; geht die Ansage auf, gibt es **+1 Punkt extra**, geht sie daneben, kostet die große Klappe **1 Punkt zusätzlich** (nie unter 0). Bonus und Malus sind bewusst gleich groß: **Erwartungswert null**, sonst wäre das Ansage-Duell strikt besser als das normale und würde es verdrängen. Eine Ansage „ich verliere" gibt es bewusst **nicht** – mit Bonus *und* Malus käme sie rechnerisch immer auf 0 heraus (risikofreie Versicherung), also eine tote Option. Die Siegesserie richtet sich weiter nach dem echten Spielausgang. Zustandslos wie das normale Duell (kein Redis)
- [x] Ping-Pong-**Siegesserie**: Der Bot führt pro User mit, wie viele Duelle am Stück gewonnen wurden (`PING_PONG:SERIE:<userId>`, hoch bei Sieg, gelöscht bei Niederlage) plus die längste je erreichte Serie als persönlichen Rekord (`PING_PONG:REKORD:<userId>`). Erwähnt wird sie **ab zwei Siegen in Folge** – im Duell-Ergebnis (inkl. „Die Serie von X endet nach Y Siegen", wenn der Verlierer gerade eine laufen hatte) und hinter dem Punktestand in `/pingpong bestenliste`
- [x] CI/Deploy-Workflow auf Node 22 gehoben (Host per `uberspace tools version use node 22` mitgezogen, sonst würde die CI eine andere Version testen, als Prod baut) – Node 20 war seit April 2026 End-of-Life. Nicht 24: das bietet Uberspace (noch) nicht an, 22 ist dort die höchste verfügbare Version und Maintenance LTS bis April 2027. Zusätzlich `actions/checkout` + `actions/setup-node` auf `@v5` gehoben – die Deprecation-Warnung von GitHub Actions hing an der Laufzeit der Actions selbst, nicht an `node-version`
- [x] `npm audit`-Schwachstellen (4× via verwundbarem `undici`, transitiv über `discord.js`/`@discordjs/rest`) behoben – **nicht** per `--force` (das hätte auf discord.js@13 downgraded), sondern per `overrides: { "undici": "^6.27.0" }` in der `package.json`; discord.js bleibt auf 14.x, `npm audit` meldet 0 Schwachstellen
- [x] Sport: Meilenstein-Ankündigung, wenn die Gesamtsumme eine Schwelle überschreitet (`/sport meilenstein setzen` für alle offen, `liste`/`entfernen`/`ankuendigungskanal` als Admin; `announced`-Flag pro Meilenstein, Prüfung in allen summen-erhöhenden Pfaden)
- [x] Sport: Bestätigung beim Eintragen persönlicher gestalten – Flavortext + Nennung des Users + Profilbild (Embed), damit User sich im Post wiederfinden
- [x] Blåhaj-Rechner: reagiert automatisch auf €-Beträge im Chat (Umrechnung in Blåhajs à 28 €) und summiert alle Erwähnungen zu einer Gesamtfläche in ha; Abruf per `/blahaj`
- [x] Visual Noise reduzieren: Emojis radikal aus den Bot-Antworten entfernt (User-Feedback: „visuelles Äquivalent von ADHS"). Ausnahmen bewusst behalten: Sport-Aktivitäts-Icons sowie die funktionalen Statusmarker im Audit-Log (`/protokoll`) und in `/twitch diagnose`. (Die `/hilfe`-Kategorie-Icons galten anfangs als Ausnahme, wurden am 2026-07-10 aber auf Wunsch ebenfalls entfernt.)
- [x] Zählen, wie oft jemand dem Server schon beigetreten ist – wer geht und wiederkommt, zählt hoch; die Beitritts-Meldung nennt es ab dem zweiten Mal (`MEMBER:JOIN_COUNT:<userId>`, dauerhaft). Gezählt wird auch ohne konfigurierten Log-Channel; Bestandsmitglieder starten bei 0, die Zählung beginnt ab Inbetriebnahme
- [x] Der „Neuigkeiten am "-Teil von https://www.lotgd.de/news.php (das Ingame-Ereignislog) wird als eigener Befehl `/ereignisse` ausgegeben – die neuesten 5 der 50 Ereignisse. Bewusst kein `/news`-Subcommand: das hätte das blanke `/news` gekostet, da Discord dann immer einen Subcommand verlangt
- [x] `deploy.yml` in zwei Jobs aufgeteilt (`test` und `deploy`, verkettet per `needs: test`), sodass nur bei grünen Tests deployt wird. Der `test`-Job läuft zusätzlich auf Pull Requests (`on: pull_request`), der `deploy`-Job nur bei Push auf `main` (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`). Der `deploy`-Job **baut bewusst nicht** – er synct nur den Source-Baum, weil der Uberspace-Host sich beim Restart ohnehin selbst neu baut (`start-server` = `npm ci && npm run build && npm start`); ein vorgebautes `dist/` wäre Wegwerf-Arbeit. Zusätzlich ein `concurrency`-Block (`cancel-in-progress: false`), damit zwei schnell aufeinanderfolgende Pushes auf `main` sich nicht bei `rsync`/`supervisorctl restart` überlappen, ein Workflow-weiter `permissions: contents: read` (Least-Privilege) und `cache: npm` in `setup-node`
- [x] `/online` zeigt, wer gerade im Spiel eingeloggt ist – live gescrapt von `https://www.lotgd.de/list.php` (öffentlich, kein Login nötig). Kombiniert die reiche „gerade eingeloggt"-Tabelle (Name, Stufe, Rasse, Ort, Gilde, tot/lebendig) mit den Namen der letzten 30 Minuten (dedupliziert). Flacher Command wie `/news`/`/ereignisse` (nur in `/hilfe` dokumentiert), `null`-tolerant. Dabei den geteilten `decodeEntities` (news.service) um die vollen Latin-1-Akzentbuchstaben + hex-numerische Entities erweitert, damit Spielernamen wie „Útlaga" nicht als `&Uacute;tlaga` durchrutschen (kam auch `/news`/`/ereignisse` zugute)
- [x] `/spielwelt` als Detail-Hilfe für die Spiel-Daten-Befehle `/news`/`/ereignisse`/`/online`. Eigener flacher Befehl (nicht `/news hilfe` o.ä.), weil die drei flach bleiben müssen (sonst fiele das blanke `/news` weg); `/hilfe` verweist im „Spielwelt"-Block darauf
- [x] `/charakter` (Weg A): User verknüpfen ihren LotGD-Charakter (nur der öffentliche Name, **keine Zugangsdaten**) und rufen dessen Infos aus der öffentlichen Kriegerliste ab (Stufe, Rasse, Ort, Gilde, lebendig, zuletzt gesehen) – als Embed. Gruppen-Command mit `verknuepfen`/`anzeigen`/`entfernen`/`hilfe`; Roster wird kurz gecacht, Name gegen die Liste validiert. Bewusst **keine gespeicherten Passwörter** (md5-Hash von lotgd.de ist login-äquivalent)
- [x] Nachgang zu `/charakter`: `/online` und `/ereignisse` heben **verknüpfte Charaktere hervor** – der Name wird fett gesetzt und der zugehörige Discord-User dahinter genannt (`<@id>`, per `allowedMentions: {parse: []}` **ohne Ping**). Abgleich über `characterService.getAllLinks()` plus zwei neue Matcher: `findLinkForName` (Anzeigename inkl. Titel-Präfix, Suffix-Match wie `findInRoster`) und `findLinksInText` (Fließtext im Ereignislog, Wortgrenzen per Unicode-Lookaround statt `\b`, sonst würde „Útlaga" nicht matchen). Fehlertolerant: sind die Verknüpfungen nicht ladbar, kommt die Liste trotzdem – nur ohne Hervorhebung
- [x] Nachrichten-Logging zeigt jetzt den **alten Inhalt** auch dann, wenn discord.js die Nachricht nicht mehr im RAM hat: eigener Redis-Cache (`LOGGING:MESSAGE:<id>`, **7 Tage TTL**, Anhänge nur als Dateiname), der **nur befüllt wird, wenn überhaupt ein Log-Channel gesetzt ist**, und nach dem Lösch-Log sofort wieder aufgeräumt wird. Dazu `docs/datenhaltung.md`: vollständige Übersicht, was der Bot speichert, wie lange und was er bewusst nicht speichert (keine Zugangsdaten)
- [x] Konsistenz-Durchgang nach dem Wachstum: gemeinsamer LotGD-Fetch-Helper `lotgd.service.ts` (`fetchLotgdHtml`: Bot-UA + ISO-8859-1 + Fehler-Logging, vorher 3× dupliziert in news/online/character), Command-Test-Lücken geschlossen (Drift-Test für `/charakter`, Delegations-Tests für `ereignisse`/`online`/`spielwelt`/`pingpong`/`pingbestenliste`), `/spielwelt` erwähnt jetzt auch `/charakter`, Legacy-Redis-Keys (Ping-Pong-Score, `user.service`) als bewusste Ausnahmen dokumentiert

### Verworfen

- Bot-Namen kürzen/knackiger machen, damit er kompakt in der Chatleiste steht – **verworfen (2026-07-19):** der Name „Mechanischer Grüner Drache" bleibt bewusst so, wie er ist. (Wäre ohnehin kein Code-Todo gewesen – der Bot-Username wird im Discord Developer Portal gesetzt, kein `setUsername` im Projekt.)
