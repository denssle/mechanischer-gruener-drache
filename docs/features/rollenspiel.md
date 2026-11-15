# Roleplay-Suche (`/rollenspiel`, seit 2026-07-26, war README-Todo)

- Zweck: Wer Lust auf Roleplay hat, meldet sich als suchend und findet Mitspieler. Gruppen-Command `suche`/`suchende`/`beenden`/`hilfe`, **für alle offen**. Dateien heißen `rp.handler.ts`/`rp.service.ts` (Command-Datei `rollenspiel.command.ts`).
- `/rollenspiel suche` hat eine **Pflicht-Choice `art`** (`pbp`/`live`/`beides`, Typ `RpArt` im Service); `formatArt` (exportiert + getestet) übersetzt die internen Werte in die Anzeige (`PbP`/`Live`/`PbP & Live`) – einziger Übersetzungsort.
- **Bewusst so einfach wie möglich** (User-Wunsch): Speicherung als Redis-Hash `RP:SUCHENDE` (userId→Art), **kein Zeitstempel, kein automatisches Ablaufen** (bis zum manuellen `/rollenspiel beenden`), **kein Kanal-Aushang** (rein listenbasiert). Beim Erweitern nicht reflexartig TTL/Aushang nachrüsten – das war eine Design-Entscheidung, kein Versäumnis.
- `/rollenspiel suchende` ist **öffentlich** und listet die Suchenden **mit Namen als Text** (`holeAnzeigenamen`, seit 2026-11-15; vorher `<@id>`-Mentions, die ohne Ping-Freigabe oft als „Unbekannter Benutzer“ erschienen). `allowedMentions: {parse: []}` bleibt **Pflicht**: Anzeigenamen sind Freitext, ein Name wie `<@…>` würde sonst pingen. An/Abmelden antworten ephemer.
- `handleBeenden` prüft die Mitgliedschaft per `rpService.istSuchend` (→ neuer `redisService.hashFieldExists`, `HEXISTS` mit `Boolean`-Cast wie `isSetMember`), statt den ganzen Hash zu holen.
- `rp.handler.ts` importiert `client` nicht – Zirkular-Import-Falle kein Thema.
