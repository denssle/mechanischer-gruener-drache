# Mechanischer Grüner Drache

Discord-Bot für den Community-Server von [Legend of the Green Dragon (LotGD)](https://www.lotgd.de/), einem Browser-RPG. Hobby-Projekt für einen kleinen, privaten Server – Features wie Ping-Pong, Sport-Tracking und Twitch-Benachrichtigungen sind Community-Spielereien für diesen Server, nicht Teil des eigentlichen Spiels.

## Techstack

- TypeScript, Node.js 20, discord.js v14, Redis (Unix Socket)
- Hosted on Uberspace, Supervisor für Prozessverwaltung

## Struktur

- src/commands/ – Slash Command Definitionen
- src/handlers/ – Business Logik
- src/services/ – Redis und externe APIs
- src/server/ – Webhook Server (Twitch EventSub)
- src/types/ – Interfaces und Types

## Konventionen

- Deutsche Bot-Antworten
- **Command-, Subcommand- und Options-Namen sind deutsch und sprechend** (z.B. `/twitch verknuepfen`, `/sport eintragen`, Option `benutzername`/`kanal`/`beschriftung`). Umlaute in den Namen selbst vermeiden – als `ae/oe/ue` schreiben (Discord mag keine Umlaute in Command-Namen); in den `setDescription`-Texten sind Umlaute normal. Am 2026-07-04 wurde der komplette Command-Bestand von gemischt englisch/deutsch auf durchgehend deutsch umgestellt (u.a. `ping`→`pingpong`, `pinghighscore`→`pingbestenliste`, `log`→`protokoll`, `twitch set/remove/info/notification-*`→`verknuepfen/entfernen/status/benachrichtigungs*`, `sport hinzufuegen/legacy`→`eintragen/altkilometer`). `version` blieb bewusst. Die Handler-Methodennamen wurden mitgezogen (z.B. `handleSet`→`handleVerknuepfen`), damit Dispatch und Namen konsistent bleiben.
- Command-Definitionen sind untypisierte Objektliteralle (`export default { data, execute }`), keine `satisfies Command` o.ä. Der `Command`-Typ (`src/types/discord.ts`) existiert nur für `client.commands`/`interaction.handler.ts`.
- Redis-Keys immer als KEYS-Objekt im Service
- deferReply() bei API-Calls die länger dauern können
- Tests mit Vitest, Redis wird pro Testdatei inline mit `vi.mock('../services/redis.service.js', () => ({ default: { ... } }))` gemockt (kein zentrales Mock-File, `src/mocks/` existiert nicht)

## Deployment

- `console.log`/`console.error`-Ausgaben werden vom Hoster (Uberspace/Supervisor) tatsächlich mitgeschnitten und persistiert – bei Fehlern die nur geloggt werden (z.B. gescheiterte Notification-Zustellung), ist das also keine reine Diagnose-Attrappe, sondern real nachvollziehbar. Kein zusätzliches Alerting nötig, solange man bereit ist, ins Log zu schauen.
- GitHub Actions (`.github/workflows/deploy.yml`) deployt bei jedem Push auf `main` **direkt in Produktion** auf Uberspace, kein Staging. `npm test` → `npm run build` → Twitch-Webhook-Integrationstest gegen den echten laufenden `dist/index.js` → `rsync` → `supervisorctl restart drache`. Ein rotes Gate verhindert das Deployment, ist also bewusst streng zu behandeln, nicht nur "CI grün bekommen".
- Supervisor auf dem Uberspace-Host startet den Bot über `npm run start-server` (= `npm ci && npm run build && npm start`) – der Server baut sich also bei jedem Restart selbst nochmal aus dem gerade gerynchten Source neu, das per CI vorgebaute `dist/` aus dem Workflow wird dabei überschrieben. D.h. `npm run build` muss nicht nur in der CI, sondern auch mit dem Node/npm auf Uberspace funktionieren.
- Skripte unter `scripts/*.ts` werden für CI/lokale Nutzung mit `tsconfig.scripts.json` zu `dist-scripts/` kompiliert und mit purem `node` ausgeführt (`npm run build:scripts`, `npm run test:twitch`). **Kein ts-node** – dessen ESM-Loader-Registrierung (`--esm`/`--transpile-only`) ist zwischen Node-Versionen/npx-Installationen unzuverlässig; hat lokal auf Node 24 funktioniert, in der Node-20-CI aber mit `ERR_UNKNOWN_FILE_EXTENSION` zuverlässig gecrasht.
- **Der Supervisor-Config von `drache` (`~/etc/services.d/drache.ini` auf dem Host) braucht `stopasgroup=true` + `killasgroup=true`.** Ohne das killt `supervisorctl restart` nur den `npm`-Wrapper (`npm ci && build && npm start`), der eigentliche `node dist/index.js`-Enkelprozess überlebt verwaist und **hält Port 3000 weiter belegt**. Der neu startende Prozess bekommt dann keinen sauberen Listener auf 3000 → der Webhook-Server ist von außen nicht erreichbar (`uberspace web backend list` zeigt `/twitch http:3000 => NOT OK, no service`, extern nginx `502`) → **Twitch-EventSub-Verifizierung scheitert, Subscriptions bleiben `webhook_callback_verification_pending`, es kommt gar keine Live-Meldung an**. Am 2026-07-04 live so gewesen (Testuser bekamen nichts), per sauberem Neustart (`supervisorctl stop` → `pkill -f dist/index.js` → `start`) behoben, `killasgroup` verhindert die Wiederkehr. Diagnose-Werkzeug dafür: `/twitch diagnose` (siehe Twitch-Feature) + `curl -i https://enzlor.uber.space/twitch/eventsub` (gesund = `404 Cannot GET`, kaputt = `502`).
- `webhookServer.start()` registriert seit 2026-07-04 einen `server.on('error', …)`-Handler (`handleServerError`), damit ein fehlgeschlagenes Port-Bind **laut ins (persistierte) Log** schreibt statt lautlos zu verschwinden – vorher lief der Bot bei EADDRINUSE scheinbar normal weiter (Discord ok), nur der Webhook war tot, was die Ursachensuche massiv erschwert hat. Analog zur node-redis-`error`-Falle (siehe Stolperfallen).

## Bekannte Stolperfallen

- Callbacks/Handler, die als `void`-Funktion registriert werden (z.B. `webhookServer.onNotification(...)`/`onRevocation(...)` in `src/index.ts`) aber async sind, brauchen ein explizites `.catch()`. Ohne das killt eine unhandled promise rejection den kompletten Bot-Prozess (Node ≥15) – ist im Twitch-Notification-Pfad am 2026-07-03 live passiert (Redis war nicht verbunden, `handleStreamOnline` warf, Prozess crashte).
- Type-only Imports (z.B. `import { Command } from './types/discord.js'`) werden von `vitest`/esbuild nicht auf Existenz geprüft, nur von `tsc`. Ein fehlendes Type-File fällt also nicht bei `npm test` auf, sondern erst bei `npm run build` – im CI-Workflow läuft `npm run build` *nach* `npm test`, checkt also vor dem eigentlichen Fehlerfall niemand.
- Twitch-EventSub-Notifications werden nicht per Message-ID dedupliziert – retried Twitch eine Zustellung (z.B. bei Timeout), könnte theoretisch zweimal "ist live"-gepostet werden. Bewusst nicht gefixt (Hobby-Projekt, seltener Edge-Case), falls es doch mal stört: Redis-SET mit kurzer TTL über die Message-ID wäre der Ansatz.
- Jeder node-redis-Client **muss** einen `.on('error', ...)`-Listener haben, sonst crasht ein unhandled `'error'`-Event (z.B. bei einem Verbindungsabbruch/gescheiterten Reconnect) sofort den kompletten Bot-Prozess – node-redis emittiert das aktiv, auch während der eingebauten automatischen Reconnect-Strategie. War in `redis.service.ts` bis 2026-07-03 nicht gesetzt; seitdem im Constructor registriert (nur Logging, kein Reconnect-Code nötig – node-redis regelt das selbst). Betraf potenziell den gesamten Bot, nicht nur Twitch.
- `redisService.getSortedSet()` ist **hart auf die Top 10** begrenzt (`zRangeWithScores(key, 0, 9, {REV: true})`) – gedacht für Leaderboard-Anzeigen (Ping-Pong-Highscore), nicht zum Aufsummieren über alle Mitglieder. Für "alle Werte summieren" (z.B. Sport-Gesamtkilometer) `getSortedSetAll()` benutzen (ungekürzt, `0, -1`). War in `sportService.getGesamtKilometer` bis 2026-07-03 falsch (undercounted ab >10 Score-Haltern, inkl. dem Legacy-Dummy-User).
- **Handler, die über `commands/index.js` erreichbar sind** (also von einer `*.command.ts` importiert werden, z.B. `logging.handler.ts` via `log.command.ts`), dürfen `client` **nicht auf Modul-Top-Level verwenden** (z.B. `client.on(...)` direkt als Seiteneffekt beim Import). Zirkuläre Kette `client.ts → commands/index.js → *.command.ts → handler.ts → client.ts`: `client` ist zu dem Zeitpunkt noch nicht initialisiert → `ReferenceError: Cannot access 'client' before initialization`. `twitch.handler.ts` nutzt `client` nur innerhalb von Methodenkörpern (funktioniert), `member.handler.ts` verkabelt sich selbst am Modul-Top-Level (funktioniert nur, weil es *nicht* über `commands/index.js` eingebunden wird, sondern direkt von `index.ts`). Handler, die von einem Command importiert werden UND `client.on(...)` brauchen, müssen die Verkabelung stattdessen in `index.ts` machen (wie `message.handler.ts`/`logging.handler.ts`). Am 2026-07-03 beim Bau des Logging-Features live so gecrasht, erst durch den Boot-Test in CI-Modus aufgefallen.

## Twitch-Feature (`/twitch`)

- 1 Discord-User = 1 Twitch-Link (`handleSet` blockt bei bestehendem Link). Channel + Rolle für Notifications sind global vom Admin gesetzt (`TWITCH:NOTIFICATION_CHANNEL`/`_ROLE`), nicht pro User.
- `twitchService.unsubscribeFromStreamOnline` behandelt ein 404 von Twitch (Subscription dort schon weg) als Erfolg – wichtig für Idempotenz bei `/twitch entfernen` und beim Revocation-Handling.
- Twitch `revocation`-Webhooks (z.B. Auth entzogen) räumen automatisch den zugehörigen Redis-Link auf (`twitchHandler.handleSubscriptionRevoked`, verkabelt über `webhookServer.onRevocation` in `src/index.ts`) – der User müsste sich danach neu verknüpfen, es bleibt aber kein verwaister Link liegen.
- `/twitch benachrichtigungskanal` ist über `addChannelTypes` auf Text-/Announcement-Channels beschränkt, damit kein Voice-Channel o.ä. gewählt werden kann, an dem `channel.send()` sonst still scheitern würde.
- `twitch.command.test.ts` prüft zusätzlich, dass jeder im `SlashCommandBuilder` definierte Subcommand-Name auch im `switch` in `execute()` dispatcht wird (die Namen stehen doppelt im Code, das ist die einzige Absicherung gegen Drift zwischen beiden).
- `/twitch diagnose` (Admin, seit 2026-07-04) ist das Debugging-Werkzeug für „es kommt keine Live-Meldung an": prüft ob ein Benachrichtigungskanal gesetzt **und abrufbar** ist, ob eine Rolle gesetzt ist, fragt via `twitchService.listStreamOnlineSubscriptions()` die EventSub-Subscriptions bei Twitch ab und zählt sie nach Status (nur `enabled` stellt zu – `webhook_callback_verification_pending` heißt: Twitch konnte den Webhook nie verifizieren, Endpoint nicht erreichbar oder `TWITCH_WEBHOOK_SECRET` falsch) und postet zum End-to-End-Test eine Nachricht in den Kanal. Antwort an den Admin ist ephemer, die Testnachricht landet real im Kanal.
- `handleStreamOnline` loggt seit 2026-07-04 an **allen** Abbruchstellen (unbekannter Broadcaster / kein Kanal / Kanal nicht abrufbar) mit `console.warn` – vorher waren zwei davon stille `return`s, was „keine Meldung"-Fehler unnötig schwer nachvollziehbar machte (Hoster persistiert die Logs).

## Sport-Feature (`/sport`)

- Bewusst **kooperativ, nicht kompetitiv**: alle tragen zu einer gemeinsamen Gesamt-Kilometerzahl bei (`/sport gesamt`), es gibt keine Rangliste. Ein früherer `/sport bestenliste`-Befehl (Top-10-Leaderboard) wurde deshalb wieder entfernt (samt `sportService.getHighscore`) – nicht versehentlich, das war eine bewusste Design-Entscheidung gegen Konkurrenzdenken auf dem Server.
- `/sport setzen` (Admin, Kilometerstand eines Users direkt setzen) schreibt nur den Bestenlisten-Score, legt aber keinen `SportEntry` an. Der eigene `/sport statistik`-Wert (aus den individuellen Einträgen berechnet) kann danach vom `/sport gesamt`-Beitrag dieses Users abweichen – als Admin-Korrekturwerkzeug für Altdaten so gewollt, aber gut zu wissen falls das mal für Verwirrung sorgt.
- `LEGACY_KILOMETERS` ist ein Dummy-User in der Bestenliste (`/sport altkilometer`, Admin) für Kilometer ohne zuordenbaren Discord-User – zählt zu `/sport gesamt` dazu, taucht aber nirgends als "Person" auf (seit Entfernung von `bestenliste` sowieso irrelevant, war vorher aber explizit rausgefiltert).

## Logging-Feature (`/protokoll`)

- `/protokoll kanal:<#channel>` (Admin) setzt den Ziel-Channel für Nachrichten-Logs, gespeichert in Redis (`LOGGING:CHANNEL`, `logging.service.ts`). Flacher Command ohne Subcommands (wie `/version`), da aktuell nur diese eine Aktion existiert. (Command am 2026-07-04 von `/log`/Option `channel` auf `/protokoll`/`kanal` eingedeutscht.)
- `client.ts` braucht `partials: [Partials.Message, Partials.Channel]`, sonst feuern `MessageDelete`/`MessageUpdate` für nicht (mehr) gecachte Nachrichten gar nicht erst – ohne das würde das Feature den Großteil der Deletes/Edits einfach verpassen.
- Alter Inhalt ist bei nicht gecachten Nachrichten grundsätzlich nicht rekonstruierbar (Discord-API-Grenze, kein Bug) – zeigt dann `*nicht verfügbar*` statt zu crashen oder leer zu bleiben.
- Bot-Nachrichten werden ignoriert (sonst loggt der Bot ständig seine eigenen Antworten). `MessageUpdate` ohne echte Content-Änderung wird ebenfalls ignoriert (Discord feuert das Event z.B. auch beim Nachladen von Link-Embeds, nicht nur bei echten Edits).
- Loggt seit 2026-07-03 zusätzlich Server-Beitritt/-Austritt (`GuildMemberAdd`/`GuildMemberRemove`) in denselben Log-Channel. `member.handler.ts` hört auf **dieselben** Events für einen anderen Zweck (aktuell nur `console.log`, historisch war da mal mehr geplant) – zwei separate `client.on(...)`-Registrierungen für dasselbe Event in unterschiedlichen Dateien sind hier bewusst so, nicht redundant: unterschiedliche Zuständigkeiten (User-Daten-Tracking vs. Audit-Log-Channel).

## Rollen-Selbstvergabe / Button-Rollen (`/rollenbutton`)

- Zweck: User geben sich **selbst** Rollen (z.B. "Einwohner" als Regel-Akzeptanz beim Server-Beitritt, oder die Twitch-Benachrichtigungs-Rolle zum Selbst-An/Abmelden). Am 2026-07-04 von einer Reaction-basierten Variante (`/rolle`, User reagiert mit Emoji) auf **Buttons** umgestellt – Buttons sind der modernere, sauberere discord.js-v14-Weg: kein Zumüllen der Nachricht mit Fremd-Reactions, klares ephemeres Feedback, selbsterklärendes Toggle. Die alte Reaction-Variante (`reactionRole.handler.ts`/`.service.ts`/`rolle.command.ts` + `REACTIONROLE:`-Redis-Keys) wurde dabei komplett entfernt, nicht parallel behalten.
- `/rollenbutton text:<text> rolle:<@Rolle> beschriftung:<beschriftung> [emoji:<emoji>]` (Admin) lässt den **Bot eine neue Nachricht posten** mit dem Text und einem Button darunter. Bot postet via `interaction.channel.send(...)`, quittiert dem Admin nur ephemer – die Button-Nachricht selbst ist also eine Bot-Nachricht (nötig, weil Discord Buttons nur an Bot-eigene Nachrichten erlaubt).
- **Kein Redis, kein State:** Die Rolle steckt direkt in der Button-`customId` (`role-toggle:{roleId}`). Beim Klick liest `buttonRoleHandler.handleButton` die Rolle da raus und **toggelt** sie (User hat sie → entfernen, sonst → vergeben), ephemere Rückmeldung jeweils. Dadurch überlebt die Bindung jeden Bot-Neustart automatisch, ohne dass irgendwo etwas gespeichert werden muss. `reactionRole.service.ts` ist damit ersatzlos weggefallen.
- Verkabelung: Buttons sind **Interactions**, keine Reactions. `interaction.handler.ts` routet `interaction.isButton()` an `buttonRoleHandler.handleButton`. Dadurch fielen `GatewayIntentBits.GuildMessageReactions` + `Partials.Reaction`/`Partials.User` (`client.ts`) und die beiden `MessageReactionAdd`/`-Remove`-`client.on`-Zeilen in `index.ts` wieder weg – Buttons brauchen davon nichts.
- Setzt voraus, dass der Bot "Rollen verwalten"-Rechte hat **und** seine eigene Rolle in der Server-Hierarchie über der zu vergebenden Rolle steht – sonst schlägt `member.roles.add/remove` mit einem Discord-API-Fehler fehl. Wird im `handleButton`-catch geloggt und dem User ephemer als "hat nicht geklappt" gemeldet (crasht nicht). Reine Server-Konfiguration, kein Code-Fix möglich.
- `buttonRole.handler.ts` importiert `client` **nicht** – die zirkuläre-Import-Falle (siehe Stolperfallen) fällt hier von vornherein weg. Die `client.on(...)`-Registrierung lebt ohnehin in `interaction.handler.ts` (das `client` importiert, aber *nicht* über `commands/index.js` erreichbar ist).

## Member-Handling (`src/handlers/member.handler.ts`)

- Einzige Handler-Datei, die (bis 2026-07-03) Logik direkt inline in `client.on(...)`-Callbacks statt als benannte Klassenmethoden hatte – deshalb ungetestet und beim Command-Block-Review leicht übersehen (kein Slash-Command). Jetzt wie die anderen Handler als `MemberHandler`-Klasse mit Methoden, `memberHandler` als Default-Export, `client.on(...)`-Verkabelung bleibt in der Datei selbst (nicht in `index.ts`, nur `loadAllMembers()` wird von dort aufgerufen).
- `handleUserUpdate` nutzt `client.guilds.cache.get(config.GUILD_ID)` statt `.first()` – der Bot ist aktuell ohnehin fest auf eine Guild ausgelegt (siehe README-Todo "Bot generalisieren für jeden Server"), aber `.first()` war eine implizite Annahme statt einer expliziten Referenz auf die konfigurierte Guild.

## Links

- [GitHub](https://github.com/denssle/mechanischer-gruener-drache)
