# Plan: Multi-Guild (Stufe 2)

> Status: **Idee / Backlog** – bewusst noch nicht umgesetzt. Der Bot läuft aktuell fest
> auf einer Guild (`config.GUILD_ID`, globale Redis-Keys). Dieses Dokument beschreibt den
> vollständigen Umbau, sodass **eine Bot-Instanz gleichzeitig viele Server bedient**.
> „Stufe 1" (jede Instanz bedient genau einen Server, nur sauber generalisiert) wäre die
> Teilmenge davon ohne den Twitch-Fan-out.

## Ziel

Eine laufende Instanz kann auf beliebig vielen Guilds gleichzeitig sein. Jede Guild hat
**ihre eigene** Konfiguration und Daten: eigener Log-Channel, eigenes Event, eigene
Sport-Gesamtsumme, eigene Ping-Pong-Bestenliste, eigener Twitch-Benachrichtigungskanal +
Rolle, eigene Twitch-Verknüpfungen. Nichts leakt zwischen Servern.

## Kernproblem: alle Redis-Keys sind global

Heute (Beispiele):

| Key | Service | heute | soll |
|---|---|---|---|
| `LOGGING:CHANNEL` | `logging.service.ts` | 1 Wert global | pro Guild |
| `EVENT:NEXT` | `event.service.ts` | 1 Event global | pro Guild |
| `SPORT:HIGHSCORE`, `SPORT:USER:*`, `SPORT:ENTRY:*` | `sport.service.ts` | global | pro Guild |
| Ping-Pong-Keys | **inline in `pingPong.handler.ts`** (kein Service!) | global | pro Guild |
| `TWITCH:NOTIFICATION_CHANNEL` / `_ROLE` | `twitch.user.service.ts` | global | pro Guild |
| `TWITCH:USER:*`, `TWITCH:ALL_LINKS` | `twitch.user.service.ts` | global | pro Guild (Verknüpfung), s.u. |
| `TWITCH:MAPPING:*`, `TWITCH:SUBSCRIPTION:*` | `twitch.user.service.ts` | 1 Twitch = 1 Discord | **geteilte Subscription, Fan-out**, s.u. |

**Konvention für den Umbau:** ein Helper `guildKey(guildId, rest)` → `GUILD:${guildId}:${rest}`.
Damit wird aus `LOGGING:CHANNEL` → `GUILD:123:LOGGING:CHANNEL`. Jede Service-Methode, die
heute einen dieser Keys anfasst, bekommt `guildId: string` als **erstes** Argument.

## Woher kommt die `guildId`?

- **Slash-Commands:** `interaction.guildId` (bei jeder `ChatInputCommandInteraction` vorhanden,
  `null` nur in DMs). Handler am Anfang gegen `null` absichern → „Dieser Befehl geht nur auf
  einem Server." Alternativ per Command-Definition DMs ganz verbieten
  (`.setDMPermission(false)`), dann ist `guildId` praktisch immer gesetzt.
- **Gateway-Events** (Logging: MessageDelete/Update/BulkDelete, GuildMember*, GuildBan*):
  tragen die Guild mit (`message.guildId`, `member.guild.id`, `ban.guild.id`).
- **Twitch-Webhook** (kein Interaction-Kontext!): die Guild(s) kommen aus dem gespeicherten
  Membership-Set des Broadcasters – **das ist der Knackpunkt**, siehe unten.

## Phase A – Nicht-Twitch-Services generalisieren (das „einfache" 80 %)

Mechanisch, aber breit. Reihenfolge so, dass die Suite pro Schritt grün bleibt.

1. **Helper anlegen:** `src/services/guildKey.ts` mit `guildKey(guildId, rest)`.
2. **`logging.service.ts`**: `setChannel/getChannel` bekommen `guildId`. Key →
   `guildKey(guildId, 'LOGGING:CHANNEL')`. Aufrufer: `logging.handler.ts` (jede Event-Methode
   holt `guildId` aus dem Event) + `protokoll.command`/-handler (`interaction.guildId`).
3. **`event.service.ts`**: `setEvent/getEvent/deleteEvent` + `guildId`. Aufrufer `event.handler.ts`.
4. **`sport.service.ts`**: alle Methoden + `guildId`; `KEYS.*` durch `guildKey(...)` ersetzen.
   Aufrufer `sport.handler.ts`.
5. **Ping-Pong**: Keys aus `pingPong.handler.ts` **in einen echten `pingpong.service.ts`
   herausziehen** (Konsistenz mit dem Rest) und dabei guild-namespacen.
6. **`user.service.ts` / `member.handler.ts`**: User-Daten pro Guild ablegen
   (`GUILD:{g}:USER:{id}`), weil derselbe User auf mehreren Servern verschiedene Rollen/Nicks
   hat. `member.handler.ts` `loadAllMembers()` iteriert dann über **alle** `client.guilds.cache`
   statt nur `config.GUILD_ID`; `handleUserUpdate` schreibt pro betroffener Guild.
7. **Command-Registrierung global:** `deploy-commands.ts`
   `Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)` → `Routes.applicationCommands(CLIENT_ID)`.
   Achtung: globale Commands propagieren bis zu ~1 h (nur Betrieb, kein Code-Aufwand).
   `config.GUILD_ID` wird danach nur noch von Migration/Alt-Pfaden gebraucht → am Ende ganz raus.

## Phase B – Twitch auf Multi-Guild (der harte 20 %)

Zwei Zwänge, die das Datenmodell diktieren:

- **Twitch dedupliziert Subscriptions** nach (type, condition, transport). Zwei Guilds, die
  denselben Streamer verknüpfen, dürfen **nicht** zwei identische `stream.online`-Subscriptions
  anlegen (Twitch lehnt die zweite ab). ⇒ **eine geteilte Subscription pro Broadcaster**,
  ref-gezählt über die Guilds, die sie nutzen.
- Eine Live-Meldung muss an **alle** Guilds gehen, in denen der Streamer verknüpft ist ⇒
  **Fan-out** beim Zustellen.

### Neues Datenmodell

```
# Pro Broadcaster (global, geteilt):
TWITCH:BROADCASTER:{twitchUserId}:SUBSCRIPTION   = subscriptionId        (die eine EventSub-Sub)
TWITCH:BROADCASTER:{twitchUserId}:MEMBERS        = Set/List von "{guildId}:{discordUserId}"
TWITCH:SUBSCRIPTION:{subscriptionId}             = twitchUserId          (Reverse für Revocation)

# Pro Guild (für /twitch status, Anzeige, Diagnose):
GUILD:{g}:TWITCH:USER:{discordUserId}            = TwitchUserLink (JSON)
GUILD:{g}:TWITCH:ALL_LINKS                       = List von discordUserIds
GUILD:{g}:TWITCH:NOTIFICATION_CHANNEL            = channelId
GUILD:{g}:TWITCH:NOTIFICATION_ROLE               = roleId
```

### `twitch.user.service.ts` umbauen

- `linkUser(guildId, discordUserId, twitchUser…)`:
  1. Broadcaster schon eine Subscription? → wiederverwenden. Sonst
     `twitchService.subscribeToStreamOnline(twitchUserId)` und `…:SUBSCRIPTION` + reverse setzen.
  2. `"{guildId}:{discordUserId}"` zum `…:MEMBERS`-Set hinzufügen.
  3. Per-Guild-Link + `ALL_LINKS` schreiben (wie heute, nur guild-namespaced).
- `unlinkUser(guildId, discordUserId)`:
  1. Membership entfernen. Wenn `…:MEMBERS` **leer** → `unsubscribeFromStreamOnline` +
     Broadcaster-Keys löschen. Sonst Subscription **stehen lassen** (andere Guild nutzt sie noch).
  2. Per-Guild-Link + `ALL_LINKS` aufräumen.
- `getMembersByTwitchId(twitchUserId)` → Liste `{guildId, discordUserId}` (neu, fürs Fan-out).
- Notification-Channel/Role-Getter/Setter bekommen `guildId`.
- `getLinkByDiscordId` / `getAllLinks` bekommen `guildId`.

### `twitch.handler.ts` umbauen

- `handleVerknuepfen/handleEntfernen/handleStatus/handleBenachrichtigungs*`/`handleDiagnose`:
  `interaction.guildId` holen (null-guard) und durchreichen.
- **`handleStreamOnline(twitchUserId, event)`** – der Fan-out:
  ```
  const members = await twitchUserService.getMembersByTwitchId(twitchUserId);
  for (const { guildId, discordUserId } of members) {
      const channelId = await twitchUserService.getNotificationChannel(guildId);
      if (!channelId) { console.warn(...); continue; }          // pro Guild abbrechen, nicht global
      const channel = await client.channels.fetch(channelId) …
      const roleId  = await twitchUserService.getNotificationRole(guildId);
      const displayName = (await userService.getUser(guildId, discordUserId))?.displayName ?? event.broadcaster_user_name;
      await channel.send(...);   // je Guild eigener Channel/Rolle/Name
  }
  ```
  Wichtig: **je Guild einzeln** try/catchen und weiterlaufen (eine kaputte Guild darf die
  anderen Meldungen nicht verschlucken).
- **`handleSubscriptionRevoked(subscriptionId)`**: `TWITCH:SUBSCRIPTION:{subId}` → twitchUserId
  → alle Members auflösen und in **jeder** betroffenen Guild den Link aufräumen (die geteilte
  Sub ist ja weg). Anschließend Broadcaster-Keys löschen.
- **`/twitch diagnose`** wird pro Guild ausgewertet (Channel/Rolle/Links dieser Guild), die
  EventSub-Liste bei Twitch bleibt global – Zuordnung Broadcaster→Guild(s) über das Members-Set.

## Phase C – Migration der Bestandsdaten

Beim ersten Start der neuen Version müssen die **globalen** Keys auf die aktuelle Prod-Guild
umgezogen werden, sonst sind nach dem Deploy alle Daten „weg" (liegen unter altem Key).

- Einmaliges Skript `scripts/migrate-to-guild-namespace.ts` (Muster: `scripts/*.ts` →
  `tsconfig.scripts.json` → `dist-scripts/`, mit purem `node` ausführen, **kein ts-node** –
  siehe CLAUDE.md/Deployment).
- Es liest `config.GUILD_ID` und kopiert `LOGGING:CHANNEL`, `EVENT:NEXT`, `SPORT:*`,
  Ping-Pong-Keys, `TWITCH:NOTIFICATION_*`, `TWITCH:USER:*`/`ALL_LINKS` auf `GUILD:{id}:…`.
- Twitch-Broadcaster-Umbau: aus jedem alten `TWITCH:MAPPING:{tw}` = discordId ein
  `…:MEMBERS`-Eintrag `"{GUILD_ID}:{discordId}"` + `…:SUBSCRIPTION` aus dem alten `TWITCH:USER`-Link.
- Idempotent halten (nochmal laufen darf nicht doppeln), am besten mit einem
  `MIGRATION:guild-namespace:done`-Flag.

## Phase D – Tests, Verify-Gate, Deploy

- **Tests:** jeder `*.service.test.ts` und `*.handler.test.ts` muss die neue `guildId`-Signatur
  abbilden (erwartete Keys mit `GUILD:…`-Präfix). Das ist der zweitgrößte Brocken nach dem
  eigentlichen Umbau – viele Files, aber stumpf.
- Neuer Test für den **Fan-out** (`handleStreamOnline` mit 2 Guilds → 2 `channel.send`) und
  für **Ref-Counting** (2 Guilds linken denselben Streamer → 1 `subscribeToStreamOnline`;
  erste entlinkt → **kein** `unsubscribe`; zweite entlinkt → `unsubscribe`).
- Volle Gate wie immer (siehe `ship_workflow`): `vitest run` → `npm run build` →
  `eslint` → **CI-Boot-Test** `CI=true node dist/index.js`. Danach Version bumpen,
  CLAUDE.md/README nachziehen, committen. Nach dem Deploy Außensicht prüfen
  (`https://enzlor.uber.space/twitch/eventsub` → 404 gesund).

## Offene Design-Entscheidungen (vor dem Start klären)

1. **Darf derselbe Twitch-Kanal in *einer* Guild von *mehreren* Discord-Usern verknüpft
   werden?** Heute global „1 Twitch = 1 Discord". Sauberste neue Regel: eindeutig **pro Guild**
   (ein Twitch-Kanal einmal je Server), über Guilds hinweg aber mehrfach. Members-Set-Key
   entsprechend `"{guildId}:{discordUserId}"`.
2. **Berechtigungen für Config-Commands** bleiben `Administrator` – aber jetzt pro Guild geprüft
   (macht `interaction.memberPermissions` ohnehin schon korrekt).
3. **Ein Webhook-Host für alle Guilds** ist unkritisch (die Guild steckt in den Daten, nicht in
   der Callback-URL) – bleibt wie es ist.
4. **Datenschutz/Trennung**: sicherstellen, dass **kein** Code mehr `config.GUILD_ID` oder
   `client.guilds.cache.first()` benutzt (grep als Abnahme-Kriterium).

## Aufwand (grobe Hausnummer)

- Phase A: ein konzentrierter Tag (breit, aber mechanisch) inkl. Test-Anpassung.
- Phase B: der eigentliche Denk-Teil, ~1 Tag (Datenmodell + Fan-out + Ref-Counting + Tests).
- Phase C + D: halber Tag (Migrationsskript + Rest-Tests + Deploy-Sorgfalt).

⇒ realistisch **ein verlängertes Wochenende**, nicht ein Nachmittag. Größtes Risiko ist die
Twitch-Migration der Bestandsdaten (einmalig, in Prod, mit echten Verknüpfungen).
