# Betrieb

Was im laufenden Betrieb gilt und nicht aus dem Code hervorgeht. Deployment steht in der `CLAUDE.md`.

## Überwachung

- **Beim Deploy:** `deploy.yml` wartet nach dem Neustart bis zu drei Minuten, bis der Bot wieder antwortet.
- **Im Betrieb:** `uptime.yml` prüft alle 30 Minuten `https://enzlor.uber.space/twitch/eventsub`. Gesund ist `404`. Schlägt der Lauf fehl, mailt GitHub. Das ist kein Alarm auf die Minute: geplante Läufe können sich verspäten, und GitHub schaltet sie ab, wenn im Repo 60 Tage lang nichts passiert.
- **Fehler im Bot:** Mit gesetztem „Kanal für Bot-Fehler" auf `/config` kommen `console.error`-Meldungen gesammelt dort an, siehe [Logging](features/logging.md).

## Persistenz von Redis

Redis läuft als eigener Supervisor-Dienst (`~/etc/services.d/redis.ini`) mit der Konfiguration `~/.redis/conf`. Die Datei liegt nur auf dem Host, nicht im Repo. Seit 2026-11-22 steht darin:

    save 3600 1 300 100 60 10000

Damit schreibt Redis regelmäßig und beim Beenden `~/.redis/dump.rdb` und lädt die Datei beim Start wieder.

**Vorfall 2026-11-22:** Bis dahin stand dort `save ""`. Redis lief seit Juni rein im Speicher, ohne jemals auf Platte zu schreiben. Als Uberspace den Host um 14:08 neu startete, war die komplette Datenbank weg, `/diagnose` zeigte keine einzige Einstellung mehr. Gerettet hat das tägliche Backup von 04:23, die Änderungen des Vormittags blieben verloren. Beim Zurückspielen mussten die Tagesmarker (`GEBURTSTAG:LAST_DAY`, `SPORT:LAST_DAILY_POST`) auf den Stand von nach dem Neustart gesetzt werden, sonst wären Geburtstagsgruß bzw. Tagespost ein zweites Mal gekommen. **Wer die Redis-Konfiguration ändert: `save` nie leer lassen.** Prüfen lässt sich das live per `redis-cli -s ~/.redis/sock CONFIG GET save`.

## Backup

Die Redis-Daten (Zitate, Geburtstage, Sportdaten, Ruhmeshalle) liegen nur auf dem Uberspace. Das Skript `scripts/redis-backup.sh` zieht einen Dump nach `~/backups/drache/` und hebt ihn 14 Tage auf. Die Dateien enthalten persönliche Daten (siehe [Datenhaltung](datenhaltung.md)).

**Einrichten, einmalig auf dem Uberspace.** Per `crontab -e` eintragen:

    23 4 * * * $HOME/mechanischer-gruener-drache/scripts/redis-backup.sh

Danach einmal von Hand laufen lassen und prüfen, ob eine Datei in `~/backups/drache/` liegt.

**Mails von Cron.** Cron mailt jede Ausgabe eines Jobs. Das Skript schweigt deshalb, solange es klappt (die Erfolgsmeldungen von `redis-cli --rdb` werden geschluckt, bis 2026-11-09 kamen sie jede Nacht als Mail). Eine Mail vom Backup heißt also: etwas ist schiefgegangen, die Meldung steht drin. Kein `MAILTO=""` setzen, sonst geht auch der Fehlerfall verloren.

**Zurückspielen.** Immer mit Ruhe und vorher einer Kopie des aktuellen Standes (`redis-cli -s ~/.redis/sock --rdb <datei>`):

1. `supervisorctl stop drache`
2. Redis stoppen, damit es beim Beenden nicht den alten Stand schreibt: `supervisorctl stop redis`
3. Den Dump als `dump.rdb` in das Datenverzeichnis von Redis kopieren (Wert von `dir` in der Redis-Konfiguration, üblicherweise `~/.redis/`).
4. `supervisorctl start redis`. Bevor der Bot startet, die Tagesmarker prüfen: Liegt das Backup vor dem Tageswechsel der täglichen Aufgaben, `GEBURTSTAG:LAST_DAY` und `SPORT:LAST_DAILY_POST` auf heute setzen, falls die Aufgaben heute schon gelaufen sind. Dann `supervisorctl start drache`.
5. `/diagnose` aufrufen.

Am 2026-11-22 so durchgeführt (siehe Persistenz oben), das Vorgehen ist also einmal geübt.

**Grenze:** Das Backup liegt auf demselben Host. Es schützt vor kaputten Daten und Fehlbedienung, nicht vor dem Verlust des Hosts. Für das zweite müsste der Dump regelmäßig woandershin kopiert werden.
