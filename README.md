# Mechanischer Grüner Drache 🐲

Ein Discord-Bot für den Discord-Server von [LotgD](http://www.lotgd.de/), geschrieben in TypeScript.

## 🚀 Features

- **Ping-Pong-Duell**: Man fordert eine andere Person heraus (`/pingpong herausfordern`), sie nimmt per Button an, dann wird gespielt – Sieg bringt einen Punkt, Niederlage kostet einen. Dazu ein Anti-Spam-Cooldown und eine Bestenliste (`/pingpong bestenliste`), gespeichert in Redis.
- **Twitch-Integration**: User verknüpfen ihren eigenen Twitch-Kanal (`/twitch verknuepfen`); der Bot meldet per Webhook, wenn sie live gehen – inkl. Stream-Titel und Spiel/Kategorie. Admin-Diagnose via `/twitch diagnose`.
- **Sport-Tracking**: Bewusst kooperativ – alle tragen ihre Kilometer zu einer gemeinsamen Gesamtsumme bei (`/sport gesamt`), keine Rangliste.
- **User-Daten-Tracking**: Hält intern Namen und Rollen der Mitglieder aktuell (z.B. damit Live-Meldungen den richtigen Namen zeigen).
- **Nachrichten-Logging**: Postet bearbeitete/gelöschte Nachrichten (inkl. Massen-Löschungen), Server-Beitritte/-Austritte, Rollen- und Nickname-Änderungen, Timeouts/Mutes sowie Bans/Unbans in einen konfigurierbaren Log-Channel (`/protokoll`). Wer den Server verlässt und wiederkommt, wird gezählt – die Beitritts-Meldung sagt dann, das wievielte Mal es ist.
- **Rollen-Selbstvergabe**: Ein Admin postet mit `/rollenbutton` eine Nachricht mit einem Button; per Klick geben sich User selbst eine Rolle (nochmal klicken entfernt sie wieder), z.B. für die Regelakzeptanz oder Twitch-Benachrichtigungen. Der Bot braucht dafür "Rollen verwalten"-Rechte und muss in der Rollen-Hierarchie über der zu vergebenden Rolle stehen.
- **Event-Countdown**: Ein Admin legt den Termin des nächsten Community-Events fest (`/event setzen`); alle können per `/event countdown` fragen, wie lange es noch dauert.
- **Spiel-News**: `/news` holt die neueste News von [lotgd.de](https://www.lotgd.de/news.php) live ab und postet sie im Chat.
- **Blåhaj-Rechner**: Erwähnt jemand einen Euro-Betrag im Chat, rechnet der Bot aus, wie viele Blåhajs (IKEA-Hai, 28 €/Stück) man dafür bekäme, und summiert alle je erwähnten Beträge zu einer „Blåhaj-Fläche" in Hektar. Auf Abruf per `/blahaj`.
- **Tipps & Nettigkeiten**: Selten (~15 %, höchstens einmal pro Person und Tag) hängt der Bot an eine ohnehin ausgelöste Antwort eine kleine, **nur für dich sichtbare** Zeile – meist ein Tipp zu einem Befehl, den man vielleicht noch nicht kennt, manchmal einfach ein netter Gruß.

## 💬 Befehle

Alle Befehle, Subcommands und Optionen sind deutsch benannt. Umlaute in den Namen sind bewusst als `ae/oe/ue` geschrieben (Discord erlaubt keine Umlaute in Command-Namen).

| Befehl | Beschreibung |
|---|---|
| `/pingpong herausfordern` | Fordert eine andere Person zu einem Duell heraus (sie nimmt per Button an) |
| `/pingpong bestenliste` | Zeigt die Ping-Pong-Bestenliste |
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
- [x] Tipps zu Funktionen einstreuen (Idee: Ladebildschirme in Videospielen) – umgesetzt als **ephemere Zeile** unter einer ohnehin ausgelösten Antwort, nicht als eigener Post im Channel: ~15 % Chance, max. **ein** Tipp pro Person und Tag, nie an ephemeren Antworten (Fehler/Cooldown/Admin-Quittungen) und nicht an `/hilfe`/`/spielwelt`. Rund jede dritte Zeile ist statt eines Tipps eine kleine Nettigkeit
- [x] Ping-Pong: **komplett auf PvP umgestellt** (`/pingpong herausfordern gegner:@user`) – Match gegen eine andere Person, sie nimmt per Button an; gespielt wird auf 3 gewonnene Ballwechsel, Sieg +1 / Niederlage -1 (nie unter 0). Das Solo-Spiel gegen den Bot wurde dabei **entfernt**: Punkte kommen jetzt ausschließlich aus echten Duellen, was die alte Design-Schwäche (Bestenliste belohnt viel Klicken statt Spielen) an der Wurzel behebt. `/pingpong` ist dafür ein Gruppen-Command (`herausfordern`/`bestenliste`/`hilfe`), `/pingbestenliste` ist entfallen
- [x] Twitch-Live-Meldung um Spiel & Kategorie erweitert (`twitchService.getStreamInfo` via Helix `Get Streams`, mit Fallback falls beim Live-Gehen noch nichts verfügbar ist)
- [x] Tipps nur noch zu Befehlen zeigen, die die Person **noch nie** benutzt hat – jede Command-Ausführung landet als Befehlsname in einem Redis-Set pro User (`TIPP:USED_COMMANDS:<userId>`, keine Argumente/Inhalte, siehe `docs/datenhaltung.md`); kennt jemand schon alle Tipp-Befehle, gibt es stattdessen eine Nettigkeit. Bestandsnutzer starten mit leerem Set, die Zählung beginnt ab Inbetriebnahme
- [ ] Den Bot generalisieren für jeden Server (Multi-Guild-Plan: `docs/multi-guild-plan.md`)
- Mit dem eigentlichen Spiel interagieren (Machbarkeitsnotiz + Stufen: `docs/spiel-interaktion-idee.md`):
  - [x] **Stufe 1 – öffentliche Spielinfos (read-only):** `/news`, `/ereignisse`, `/online`, `/charakter` – alles per Scraping ohne Login, keiner der Auth-/Schreib-Blocker greift
  - [ ] ~~**Stufe 2 – persönliche Leseabfragen pro User (eingeloggt)**~~ – **geprüft und verworfen (2026-07-11).** Es gibt bei lotgd.de kein Token, das hinterlegbar, langlebig *und* harmlos ist: das Passwort bzw. sein md5-Hash ist login-äquivalent, der `lgi`-Cookie ist bloß eine Browser-Kennung (wird auch anonymen Besuchern gesetzt, enthält keine Session), und `PHPSESSID` verfällt nach **15 Minuten Leerlauf** (`LOGINTIMEOUT`). Es künstlich am Leben zu halten würde den User dauerhaft als „online" im Spiel erscheinen lassen und mit seiner echten Browser-Sitzung kollidieren. Sauber ginge nur ein vom Betreiber ausgestelltes Read-Only-Token – das existiert nicht. Herleitung: `docs/spiel-interaktion-idee.md`
  - [ ] **Stufe 3 – Aktionen im Spiel (schreibend, pro User):** Session **und** Nonce/CSRF-Handling **und** echter Spielschaden bei Fehlern (Kämpfe/Käufe/verbrauchte Züge) – der teuerste, riskanteste Teil, nur sehr vorsichtig
- [x] CI/Deploy-Workflow auf Node 22 gehoben (Host per `uberspace tools version use node 22` mitgezogen, sonst würde die CI eine andere Version testen, als Prod baut) – Node 20 war seit April 2026 End-of-Life. Nicht 24: das bietet Uberspace (noch) nicht an, 22 ist dort die höchste verfügbare Version und Maintenance LTS bis April 2027. Zusätzlich `actions/checkout` + `actions/setup-node` auf `@v5` gehoben – die Deprecation-Warnung von GitHub Actions hing an der Laufzeit der Actions selbst, nicht an `node-version`
- [x] `npm audit`-Schwachstellen (4× via verwundbarem `undici`, transitiv über `discord.js`/`@discordjs/rest`) behoben – **nicht** per `--force` (das hätte auf discord.js@13 downgraded), sondern per `overrides: { "undici": "^6.27.0" }` in der `package.json`; discord.js bleibt auf 14.x, `npm audit` meldet 0 Schwachstellen
- [x] Sport: Meilenstein-Ankündigung, wenn die Gesamtsumme eine Schwelle überschreitet (`/sport meilenstein setzen` für alle offen, `liste`/`entfernen`/`ankuendigungskanal` als Admin; `announced`-Flag pro Meilenstein, Prüfung in allen summen-erhöhenden Pfaden)
- [x] Sport: Bestätigung beim Eintragen persönlicher gestalten – Flavortext + Nennung des Users + Profilbild (Embed), damit User sich im Post wiederfinden
- [x] Blåhaj-Rechner: reagiert automatisch auf €-Beträge im Chat (Umrechnung in Blåhajs à 28 €) und summiert alle Erwähnungen zu einer Gesamtfläche in ha; Abruf per `/blahaj`
- [x] Visual Noise reduzieren: Emojis radikal aus den Bot-Antworten entfernt (User-Feedback: „visuelles Äquivalent von ADHS"). Ausnahmen bewusst behalten: Sport-Aktivitäts-Icons sowie die funktionalen Statusmarker im Audit-Log (`/protokoll`) und in `/twitch diagnose`. (Die `/hilfe`-Kategorie-Icons galten anfangs als Ausnahme, wurden am 2026-07-10 aber auf Wunsch ebenfalls entfernt.)
- [x] Zählen, wie oft jemand dem Server schon beigetreten ist – wer geht und wiederkommt, zählt hoch; die Beitritts-Meldung nennt es ab dem zweiten Mal (`MEMBER:JOIN_COUNT:<userId>`, dauerhaft). Gezählt wird auch ohne konfigurierten Log-Channel; Bestandsmitglieder starten bei 0, die Zählung beginnt ab Inbetriebnahme
- [ ] Bot-Namen kürzen/knackiger machen, damit er kompakt in der Chatleiste steht (aktuell „Mechanischer Grüner Drache")
- [x] Der „Neuigkeiten am "-Teil von https://www.lotgd.de/news.php (das Ingame-Ereignislog) wird als eigener Befehl `/ereignisse` ausgegeben – die neuesten 5 der 50 Ereignisse. Bewusst kein `/news`-Subcommand: das hätte das blanke `/news` gekostet, da Discord dann immer einen Subcommand verlangt
- [x] `deploy.yml` in zwei Jobs aufgeteilt (`test` und `deploy`, verkettet per `needs: test`), sodass nur bei grünen Tests deployt wird. Der `test`-Job läuft zusätzlich auf Pull Requests (`on: pull_request`), der `deploy`-Job nur bei Push auf `main` (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`). Der `deploy`-Job **baut bewusst nicht** – er synct nur den Source-Baum, weil der Uberspace-Host sich beim Restart ohnehin selbst neu baut (`start-server` = `npm ci && npm run build && npm start`); ein vorgebautes `dist/` wäre Wegwerf-Arbeit. Zusätzlich ein `concurrency`-Block (`cancel-in-progress: false`), damit zwei schnell aufeinanderfolgende Pushes auf `main` sich nicht bei `rsync`/`supervisorctl restart` überlappen, ein Workflow-weiter `permissions: contents: read` (Least-Privilege) und `cache: npm` in `setup-node`
- [x] `/online` zeigt, wer gerade im Spiel eingeloggt ist – live gescrapt von `https://www.lotgd.de/list.php` (öffentlich, kein Login nötig). Kombiniert die reiche „gerade eingeloggt"-Tabelle (Name, Stufe, Rasse, Ort, Gilde, tot/lebendig) mit den Namen der letzten 30 Minuten (dedupliziert). Flacher Command wie `/news`/`/ereignisse` (nur in `/hilfe` dokumentiert), `null`-tolerant. Dabei den geteilten `decodeEntities` (news.service) um die vollen Latin-1-Akzentbuchstaben + hex-numerische Entities erweitert, damit Spielernamen wie „Útlaga" nicht als `&Uacute;tlaga` durchrutschen (kam auch `/news`/`/ereignisse` zugute)
- [x] `/spielwelt` als Detail-Hilfe für die Spiel-Daten-Befehle `/news`/`/ereignisse`/`/online`. Eigener flacher Befehl (nicht `/news hilfe` o.ä.), weil die drei flach bleiben müssen (sonst fiele das blanke `/news` weg); `/hilfe` verweist im „Spielwelt"-Block darauf
- [x] `/charakter` (Weg A): User verknüpfen ihren LotGD-Charakter (nur der öffentliche Name, **keine Zugangsdaten**) und rufen dessen Infos aus der öffentlichen Kriegerliste ab (Stufe, Rasse, Ort, Gilde, lebendig, zuletzt gesehen) – als Embed. Gruppen-Command mit `verknuepfen`/`anzeigen`/`entfernen`/`hilfe`; Roster wird kurz gecacht, Name gegen die Liste validiert. Bewusst **keine gespeicherten Passwörter** (md5-Hash von lotgd.de ist login-äquivalent)
- [x] Nachgang zu `/charakter`: `/online` und `/ereignisse` heben **verknüpfte Charaktere hervor** – der Name wird fett gesetzt und der zugehörige Discord-User dahinter genannt (`<@id>`, per `allowedMentions: {parse: []}` **ohne Ping**). Abgleich über `characterService.getAllLinks()` plus zwei neue Matcher: `findLinkForName` (Anzeigename inkl. Titel-Präfix, Suffix-Match wie `findInRoster`) und `findLinksInText` (Fließtext im Ereignislog, Wortgrenzen per Unicode-Lookaround statt `\b`, sonst würde „Útlaga" nicht matchen). Fehlertolerant: sind die Verknüpfungen nicht ladbar, kommt die Liste trotzdem – nur ohne Hervorhebung
- [x] Nachrichten-Logging zeigt jetzt den **alten Inhalt** auch dann, wenn discord.js die Nachricht nicht mehr im RAM hat: eigener Redis-Cache (`LOGGING:MESSAGE:<id>`, **7 Tage TTL**, Anhänge nur als Dateiname), der **nur befüllt wird, wenn überhaupt ein Log-Channel gesetzt ist**, und nach dem Lösch-Log sofort wieder aufgeräumt wird. Dazu `docs/datenhaltung.md`: vollständige Übersicht, was der Bot speichert, wie lange und was er bewusst nicht speichert (keine Zugangsdaten)
- [ ] Idee (aus der Wyrmland-Erkundungstour 2026-07-12): `/online` nach **Stadt gruppieren** („Romar: … · Glorfindal: …") – die Ort-Spalte der Kriegerliste wird schon geparst, aber nicht genutzt; mit 9 Städten hat „wer ist wo" echten Informationswert und kostet keinen zusätzlichen Fetch
- [ ] Idee (Tour 2026-07-12): **Drachentötungs-Gratulation ohne Polling** – pro verknüpftem Charakter den zuletzt gesehenen Dragonkills-Stand in Redis merken und beim ohnehin stattfindenden Roster-Abruf (`/online`/`/charakter`, 10-min-Cache) vergleichen; Stand gestiegen → Gratulation posten. Opportunistische Erkennung statt Cron, Verzögerung von Stunden ist bei einer Gratulation egal. Offen: welcher Kanal (eigener Key oder der Sport-Ankündigungskanal?)
- [ ] Idee (Tour 2026-07-12): **Toten-Flavor** in `/charakter anzeigen` – tote Charaktere lore-korrekt beschreiben („wartet im Land der Schatten auf den neuen Tag"). Lore-Detail dazu: Wiederauferstehung geht nicht nur automatisch beim Tagesanbruch, sondern auch, indem man **Gefallen beim Totengott Ramius** sammelt
- Ideen fürs LotGD-Modul, **bewusst zurückgestellt bis das Modul von den Betreibern abgenommen ist** (Feld-Existenz gegen den Referenzcode `lib/all_tables.php` geprüft):
  - [ ] Whitelist-Erweiterung `turns` (verbleibende Waldkämpfe heute – beantwortet „lohnt es sich, heute noch reinzuschauen?") – am besten direkt beim Betreiber-Review ansprechen, die Whitelist wird dort einmal verhandelt
  - [ ] Whitelist-Erweiterung `deathpower` (Gefallen beim Totengott Ramius) – tote Charaktere könnten dann statt nur „(tot)" zeigen: „wartet im Land der Schatten, hat X Gefallen bei Ramius" (passt zum Toten-Flavor-Todo oben)
  - [ ] Optional: `resurrections` + `age` (Wiederauferstehungen, Spieltage) als Flavor-Statistik
  - [ ] Globales Feld `secondsToNextGameDay` in der API-Antwort (kein Personenbezug): der Kern hat `secondstonextgameday()` in `lib/datetime.php` fertig – damit würde der verworfene **Neuer-Tag-Countdown** doch möglich („der neue Tag bricht in 2 h an, dann füllt sich der Wald wieder")
  - [ ] Vorab unabhängig prüfbar (braucht **kein** Modul): zeigt `about.php` auf lotgd.de die Tageszeit-Infos (`dayduration`/Sekunden bis zum neuen Tag) **öffentlich** an? Laut Referenzcode (`lib/about/about_setup.php`) stünde es dort – dann ginge der Countdown schon heute per Scraping
  - [ ] Nach Live-Gang: Drachentötungs-Gratulation (Todo oben) auf API-Daten umstellen – exakte Zahlen statt Roster-Scraping, gleiches opportunistisches Muster ohne Polling
- [x] Konsistenz-Durchgang nach dem Wachstum: gemeinsamer LotGD-Fetch-Helper `lotgd.service.ts` (`fetchLotgdHtml`: Bot-UA + ISO-8859-1 + Fehler-Logging, vorher 3× dupliziert in news/online/character), Command-Test-Lücken geschlossen (Drift-Test für `/charakter`, Delegations-Tests für `ereignisse`/`online`/`spielwelt`/`pingpong`/`pingbestenliste`), `/spielwelt` erwähnt jetzt auch `/charakter`, Legacy-Redis-Keys (Ping-Pong-Score, `user.service`) als bewusste Ausnahmen dokumentiert
