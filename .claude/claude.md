# Mechanischer Grüner Drache

## Techstack

- TypeScript, Node.js 20, discord.js v14, Redis (Unix Socket)
- Hosted on Uberspace, Supervisor für Prozessverwaltung

## Struktur3

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

- GitHub Actions (`.github/workflows/deploy.yml`) deployt bei jedem Push auf `main` **direkt in Produktion** auf Uberspace, kein Staging. `npm test` → `npm run build` → Twitch-Webhook-Integrationstest gegen den echten laufenden `dist/index.js` → `rsync` → `supervisorctl restart drache`. Ein rotes Gate verhindert das Deployment, ist also bewusst streng zu behandeln, nicht nur "CI grün bekommen".
- Skripte unter `scripts/*.ts` werden für CI/lokale Nutzung mit `tsconfig.scripts.json` zu `dist-scripts/` kompiliert und mit purem `node` ausgeführt (`npm run build:scripts`, `npm run test:twitch`). **Kein ts-node** – dessen ESM-Loader-Registrierung (`--esm`/`--transpile-only`) ist zwischen Node-Versionen/npx-Installationen unzuverlässig; hat lokal auf Node 24 funktioniert, in der Node-20-CI aber mit `ERR_UNKNOWN_FILE_EXTENSION` zuverlässig gecrasht.

## Bekannte Stolperfallen

- Callbacks/Handler, die als `void`-Funktion registriert werden (z.B. `webhookServer.onNotification(...)` in `src/index.ts`) aber async sind, brauchen ein explizites `.catch()`. Ohne das killt eine unhandled promise rejection den kompletten Bot-Prozess (Node ≥15) – ist im Twitch-Notification-Pfad am 2026-07-03 live passiert (Redis war nicht verbunden, `handleStreamOnline` warf, Prozess crashte).
- Type-only Imports (z.B. `import { Command } from './types/discord.js'`) werden von `vitest`/esbuild nicht auf Existenz geprüft, nur von `tsc`. Ein fehlendes Type-File fällt also nicht bei `npm test` auf, sondern erst bei `npm run build` – im CI-Workflow läuft `npm run build` *nach* `npm test`, checkt also vor dem eigentlichen Fehlerfall niemand.

## Links

- [GitHub](https://github.com/denssle/mechanischer-gruener-drache)
