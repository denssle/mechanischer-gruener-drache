# Mechanischer Grüner Drache

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
- Command-Definitionen sind untypisierte Objektliteralle (`export default { data, execute }`), keine `satisfies Command` o.ä. Der `Command`-Typ (`src/types/discord.ts`) existiert nur für `client.commands`/`interaction.handler.ts`.
- Redis-Keys immer als KEYS-Objekt im Service
- deferReply() bei API-Calls die länger dauern können
- Tests mit Vitest, Redis wird pro Testdatei inline mit `vi.mock('../services/redis.service.js', () => ({ default: { ... } }))` gemockt (kein zentrales Mock-File, `src/mocks/` existiert nicht)

## Deployment

- `console.log`/`console.error`-Ausgaben werden vom Hoster (Uberspace/Supervisor) tatsächlich mitgeschnitten und persistiert – bei Fehlern die nur geloggt werden (z.B. gescheiterte Notification-Zustellung), ist das also keine reine Diagnose-Attrappe, sondern real nachvollziehbar. Kein zusätzliches Alerting nötig, solange man bereit ist, ins Log zu schauen.
- GitHub Actions (`.github/workflows/deploy.yml`) deployt bei jedem Push auf `main` **direkt in Produktion** auf Uberspace, kein Staging. `npm test` → `npm run build` → Twitch-Webhook-Integrationstest gegen den echten laufenden `dist/index.js` → `rsync` → `supervisorctl restart drache`. Ein rotes Gate verhindert das Deployment, ist also bewusst streng zu behandeln, nicht nur "CI grün bekommen".
- Supervisor auf dem Uberspace-Host startet den Bot über `npm run start-server` (= `npm ci && npm run build && npm start`) – der Server baut sich also bei jedem Restart selbst nochmal aus dem gerade gerynchten Source neu, das per CI vorgebaute `dist/` aus dem Workflow wird dabei überschrieben. D.h. `npm run build` muss nicht nur in der CI, sondern auch mit dem Node/npm auf Uberspace funktionieren.
- Skripte unter `scripts/*.ts` werden für CI/lokale Nutzung mit `tsconfig.scripts.json` zu `dist-scripts/` kompiliert und mit purem `node` ausgeführt (`npm run build:scripts`, `npm run test:twitch`). **Kein ts-node** – dessen ESM-Loader-Registrierung (`--esm`/`--transpile-only`) ist zwischen Node-Versionen/npx-Installationen unzuverlässig; hat lokal auf Node 24 funktioniert, in der Node-20-CI aber mit `ERR_UNKNOWN_FILE_EXTENSION` zuverlässig gecrasht.

## Bekannte Stolperfallen

- Callbacks/Handler, die als `void`-Funktion registriert werden (z.B. `webhookServer.onNotification(...)`/`onRevocation(...)` in `src/index.ts`) aber async sind, brauchen ein explizites `.catch()`. Ohne das killt eine unhandled promise rejection den kompletten Bot-Prozess (Node ≥15) – ist im Twitch-Notification-Pfad am 2026-07-03 live passiert (Redis war nicht verbunden, `handleStreamOnline` warf, Prozess crashte).
- Type-only Imports (z.B. `import { Command } from './types/discord.js'`) werden von `vitest`/esbuild nicht auf Existenz geprüft, nur von `tsc`. Ein fehlendes Type-File fällt also nicht bei `npm test` auf, sondern erst bei `npm run build` – im CI-Workflow läuft `npm run build` *nach* `npm test`, checkt also vor dem eigentlichen Fehlerfall niemand.
- Twitch-EventSub-Notifications werden nicht per Message-ID dedupliziert – retried Twitch eine Zustellung (z.B. bei Timeout), könnte theoretisch zweimal "ist live"-gepostet werden. Bewusst nicht gefixt (Hobby-Projekt, seltener Edge-Case), falls es doch mal stört: Redis-SET mit kurzer TTL über die Message-ID wäre der Ansatz.

## Twitch-Feature (`/twitch`)

- 1 Discord-User = 1 Twitch-Link (`handleSet` blockt bei bestehendem Link). Channel + Rolle für Notifications sind global vom Admin gesetzt (`TWITCH:NOTIFICATION_CHANNEL`/`_ROLE`), nicht pro User.
- `twitchService.unsubscribeFromStreamOnline` behandelt ein 404 von Twitch (Subscription dort schon weg) als Erfolg – wichtig für Idempotenz bei `/twitch remove` und beim Revocation-Handling.
- Twitch `revocation`-Webhooks (z.B. Auth entzogen) räumen automatisch den zugehörigen Redis-Link auf (`twitchHandler.handleSubscriptionRevoked`, verkabelt über `webhookServer.onRevocation` in `src/index.ts`) – der User müsste sich danach neu verknüpfen, es bleibt aber kein verwaister Link liegen.
- `/twitch notification-channel` ist über `addChannelTypes` auf Text-/Announcement-Channels beschränkt, damit kein Voice-Channel o.ä. gewählt werden kann, an dem `channel.send()` sonst still scheitern würde.
- `twitch.command.test.ts` prüft zusätzlich, dass jeder im `SlashCommandBuilder` definierte Subcommand-Name auch im `switch` in `execute()` dispatcht wird (die Namen stehen doppelt im Code, das ist die einzige Absicherung gegen Drift zwischen beiden).

## Links

- [GitHub](https://github.com/denssle/mechanischer-gruener-drache)
