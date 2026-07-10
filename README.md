# Mechanischer Grüner Drache 🐲

Ein Discord-Bot für den Discord-Server von [LotgD](http://www.lotgd.de/), geschrieben in TypeScript.

## 🚀 Features

- **Ping-Pong-Spiel**: Ein einfaches Spiel (`/pingpong`) mit zufälligem Flavor-Text und Anti-Spam-Cooldown, plus Bestenliste (`/pingbestenliste`), gespeichert in Redis.
- **Twitch-Integration**: User verknüpfen ihren eigenen Twitch-Kanal (`/twitch verknuepfen`); der Bot meldet per Webhook, wenn sie live gehen – inkl. Stream-Titel und Spiel/Kategorie. Admin-Diagnose via `/twitch diagnose`.
- **Sport-Tracking**: Bewusst kooperativ – alle tragen ihre Kilometer zu einer gemeinsamen Gesamtsumme bei (`/sport gesamt`), keine Rangliste.
- **User-Daten-Tracking**: Hält intern Namen und Rollen der Mitglieder aktuell (z.B. damit Live-Meldungen den richtigen Namen zeigen).
- **Nachrichten-Logging**: Postet bearbeitete/gelöschte Nachrichten (inkl. Massen-Löschungen), Server-Beitritte/-Austritte, Rollen- und Nickname-Änderungen, Timeouts/Mutes sowie Bans/Unbans in einen konfigurierbaren Log-Channel (`/protokoll`).
- **Rollen-Selbstvergabe**: Ein Admin postet mit `/rollenbutton` eine Nachricht mit einem Button; per Klick geben sich User selbst eine Rolle (nochmal klicken entfernt sie wieder), z.B. für die Regelakzeptanz oder Twitch-Benachrichtigungen. Der Bot braucht dafür "Rollen verwalten"-Rechte und muss in der Rollen-Hierarchie über der zu vergebenden Rolle stehen.
- **Event-Countdown**: Ein Admin legt den Termin des nächsten Community-Events fest (`/event setzen`); alle können per `/event countdown` fragen, wie lange es noch dauert.
- **Spiel-News**: `/news` holt die neueste News von [lotgd.de](https://www.lotgd.de/news.php) live ab und postet sie im Chat.
- **Blåhaj-Rechner**: Erwähnt jemand einen Euro-Betrag im Chat, rechnet der Bot aus, wie viele Blåhajs (IKEA-Hai, 28 €/Stück) man dafür bekäme, und summiert alle je erwähnten Beträge zu einer „Blåhaj-Fläche" in Hektar. Auf Abruf per `/blahaj`.

## 💬 Befehle

Alle Befehle, Subcommands und Optionen sind deutsch benannt. Umlaute in den Namen sind bewusst als `ae/oe/ue` geschrieben (Discord erlaubt keine Umlaute in Command-Namen).

| Befehl | Beschreibung |
|---|---|
| `/pingpong` | Spielt eine Runde Ping-Pong |
| `/pingbestenliste` | Zeigt die Ping-Pong-Bestenliste |
| `/sport eintragen` | Sportliche Aktivität mit Kilometern eintragen |
| `/sport statistik` | Eigene Statistik pro Aktivität |
| `/sport gesamt` | Gemeinsame Gesamtkilometer aller Mitglieder |
| `/sport bearbeiten` · `/sport loeschen` | Eigenen Eintrag korrigieren bzw. löschen |
| `/sport setzen` | Kilometerstand eines Mitglieds direkt setzen (Admin) |
| `/sport altkilometer` | Bestandskilometer ohne zugeordnetes Mitglied addieren (Admin) |
| `/sport altkilometer-setzen` | Bestandskilometer auf einen Wert setzen; `0` entfernt sie (Admin) |
| `/twitch verknuepfen` · `/twitch entfernen` · `/twitch status` | Eigenen Twitch-Kanal verknüpfen, entfernen, anzeigen |
| `/twitch benachrichtigungskanal` · `/twitch benachrichtigungsrolle` | Ziel-Kanal & Ping-Rolle für Live-Meldungen (Admin) |
| `/twitch diagnose` | Kanal, Rolle & EventSub-Subscriptions prüfen + Testnachricht (Admin) |
| `/rollenbutton` | Nachricht mit Button posten, über den User sich selbst eine Rolle geben (Admin) |
| `/protokoll` | Kanal fürs Nachrichten-/Audit-Logging festlegen (Admin) |
| `/event setzen` · `/event entfernen` | Termin des Community-Events festlegen/entfernen (Admin) |
| `/event countdown` | Zeigt, wie lange es noch bis zum Event dauert |
| `/news` | Holt die neueste Spiel-News von lotgd.de und postet sie |
| `/blahaj` | Rechnet einen Euro-Betrag (oder die Server-Gesamtsumme) in Blåhajs & Fläche um |
| `/hilfe` | Gesamtübersicht über alle Befehle des Bots |
| `/version` | Zeigt die aktuelle Bot-Version |

`/sport`, `/twitch` und `/event` haben zusätzlich je einen `hilfe`-Subcommand, der alle zugehörigen Befehle auflistet. `/hilfe` gibt eine Gesamtübersicht über alle Bereiche und Befehle.

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
- [ ] Idee: Tipps zu Funktionen einstreuen wie bei Ladebildschirmen in Videospielen - damit UserInnen wissen was Bedie Anwendung kann
- [ ] Ping-Pong: PvP-Herausforderung (`/pingpong herausfordern @user`) – Match gegen eine andere Person per Buttons
- [x] Twitch-Live-Meldung um Spiel & Kategorie erweitert (`twitchService.getStreamInfo` via Helix `Get Streams`, mit Fallback falls beim Live-Gehen noch nichts verfügbar ist)
- [ ] Den Bot generalisieren für jeden Server (Multi-Guild-Plan: `docs/multi-guild-plan.md`)
- [ ] Mit dem eigentlichen Spiel interagieren (Machbarkeitsnotiz: `docs/spiel-interaktion-idee.md`) – der **lesende, öffentliche** Teil ist erledigt (`/news`, `/ereignisse`, `/online`, `/charakter`, alles per Scraping ohne Login); offen bleibt die **authentifizierte** Interaktion (privates Gold/Werte/Aktionen via Login) – bewusst zurückgestellt (keine gespeicherten Passwörter)
- [x] CI/Deploy-Workflow auf Node 22 gehoben (Host per `uberspace tools version use node 22` mitgezogen, sonst würde die CI eine andere Version testen, als Prod baut) – Node 20 war seit April 2026 End-of-Life. Nicht 24: das bietet Uberspace (noch) nicht an, 22 ist dort die höchste verfügbare Version und Maintenance LTS bis April 2027. Zusätzlich `actions/checkout` + `actions/setup-node` auf `@v5` gehoben – die Deprecation-Warnung von GitHub Actions hing an der Laufzeit der Actions selbst, nicht an `node-version`
- [x] `npm audit`-Schwachstellen (4× via verwundbarem `undici`, transitiv über `discord.js`/`@discordjs/rest`) behoben – **nicht** per `--force` (das hätte auf discord.js@13 downgraded), sondern per `overrides: { "undici": "^6.27.0" }` in der `package.json`; discord.js bleibt auf 14.x, `npm audit` meldet 0 Schwachstellen
- [x] Sport: Meilenstein-Ankündigung, wenn die Gesamtsumme eine Schwelle überschreitet (`/sport meilenstein setzen` für alle offen, `liste`/`entfernen`/`ankuendigungskanal` als Admin; `announced`-Flag pro Meilenstein, Prüfung in allen summen-erhöhenden Pfaden)
- [x] Sport: Bestätigung beim Eintragen persönlicher gestalten – Flavortext + Nennung des Users + Profilbild (Embed), damit User sich im Post wiederfinden
- [x] Blåhaj-Rechner: reagiert automatisch auf €-Beträge im Chat (Umrechnung in Blåhajs à 28 €) und summiert alle Erwähnungen zu einer Gesamtfläche in ha; Abruf per `/blahaj`
- [x] Visual Noise reduzieren: Emojis radikal aus den Bot-Antworten entfernt (User-Feedback: „visuelles Äquivalent von ADHS"). Ausnahmen bewusst behalten: Sport-Aktivitäts-Icons sowie die funktionalen Statusmarker im Audit-Log (`/protokoll`) und in `/twitch diagnose`. (Die `/hilfe`-Kategorie-Icons galten anfangs als Ausnahme, wurden am 2026-07-10 aber auf Wunsch ebenfalls entfernt.)
- [ ] Bot-Namen kürzen/knackiger machen, damit er kompakt in der Chatleiste steht (aktuell „Mechanischer Grüner Drache")
- [x] Der „Neuigkeiten am "-Teil von https://www.lotgd.de/news.php (das Ingame-Ereignislog) wird als eigener Befehl `/ereignisse` ausgegeben – die neuesten 5 der 50 Ereignisse. Bewusst kein `/news`-Subcommand: das hätte das blanke `/news` gekostet, da Discord dann immer einen Subcommand verlangt
- [x] `deploy.yml` in zwei Jobs aufgeteilt (`test` und `deploy`, verkettet per `needs: test`), sodass nur bei grünen Tests deployt wird. Der `test`-Job läuft zusätzlich auf Pull Requests (`on: pull_request`), der `deploy`-Job nur bei Push auf `main` (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`). Der `deploy`-Job **baut bewusst nicht** – er synct nur den Source-Baum, weil der Uberspace-Host sich beim Restart ohnehin selbst neu baut (`start-server` = `npm ci && npm run build && npm start`); ein vorgebautes `dist/` wäre Wegwerf-Arbeit. Zusätzlich ein `concurrency`-Block (`cancel-in-progress: false`), damit zwei schnell aufeinanderfolgende Pushes auf `main` sich nicht bei `rsync`/`supervisorctl restart` überlappen, ein Workflow-weiter `permissions: contents: read` (Least-Privilege) und `cache: npm` in `setup-node`
- [x] `/online` zeigt, wer gerade im Spiel eingeloggt ist – live gescrapt von `https://www.lotgd.de/list.php` (öffentlich, kein Login nötig). Kombiniert die reiche „gerade eingeloggt"-Tabelle (Name, Stufe, Rasse, Ort, Gilde, tot/lebendig) mit den Namen der letzten 30 Minuten (dedupliziert). Flacher Command wie `/news`/`/ereignisse` (nur in `/hilfe` dokumentiert), `null`-tolerant. Dabei den geteilten `decodeEntities` (news.service) um die vollen Latin-1-Akzentbuchstaben + hex-numerische Entities erweitert, damit Spielernamen wie „Útlaga" nicht als `&Uacute;tlaga` durchrutschen (kam auch `/news`/`/ereignisse` zugute)
- [x] `/spielwelt` als Detail-Hilfe für die Spiel-Daten-Befehle `/news`/`/ereignisse`/`/online`. Eigener flacher Befehl (nicht `/news hilfe` o.ä.), weil die drei flach bleiben müssen (sonst fiele das blanke `/news` weg); `/hilfe` verweist im „Spielwelt"-Block darauf
- [x] `/charakter` (Weg A): User verknüpfen ihren LotGD-Charakter (nur der öffentliche Name, **keine Zugangsdaten**) und rufen dessen Infos aus der öffentlichen Kriegerliste ab (Stufe, Rasse, Ort, Gilde, lebendig, zuletzt gesehen) – als Embed. Gruppen-Command mit `verknuepfen`/`anzeigen`/`entfernen`/`hilfe`; Roster wird kurz gecacht, Name gegen die Liste validiert. Bewusst **keine gespeicherten Passwörter** (md5-Hash von lotgd.de ist login-äquivalent)
- [ ] Nachgang zu `/charakter`: `/online` und `/ereignisse` so aufbohren, dass **verknüpfte Charaktere hervorgehoben** werden, wenn sie in der Online-Liste bzw. im Ereignislog auftauchen (Basis dafür ist schon da: `characterService.getAllLinks()`)
- [x] Konsistenz-Durchgang nach dem Wachstum: gemeinsamer LotGD-Fetch-Helper `lotgd.service.ts` (`fetchLotgdHtml`: Bot-UA + ISO-8859-1 + Fehler-Logging, vorher 3× dupliziert in news/online/character), Command-Test-Lücken geschlossen (Drift-Test für `/charakter`, Delegations-Tests für `ereignisse`/`online`/`spielwelt`/`pingpong`/`pingbestenliste`), `/spielwelt` erwähnt jetzt auch `/charakter`, Legacy-Redis-Keys (Ping-Pong-Score, `user.service`) als bewusste Ausnahmen dokumentiert
