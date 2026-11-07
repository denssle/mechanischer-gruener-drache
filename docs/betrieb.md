# Betrieb

Was im laufenden Betrieb gilt und nicht aus dem Code hervorgeht. Deployment steht in der `CLAUDE.md`.

## Überwachung

- **Beim Deploy:** `deploy.yml` wartet nach dem Neustart bis zu drei Minuten, bis der Bot wieder antwortet.
- **Im Betrieb:** `uptime.yml` prüft alle 30 Minuten `https://enzlor.uber.space/twitch/eventsub`. Gesund ist `404`. Schlägt der Lauf fehl, mailt GitHub. Das ist kein Alarm auf die Minute: geplante Läufe können sich verspäten, und GitHub schaltet sie ab, wenn im Repo 60 Tage lang nichts passiert.
- **Fehler im Bot:** Mit gesetztem „Kanal für Bot-Fehler" auf `/config` kommen `console.error`-Meldungen gesammelt dort an, siehe [Logging](features/logging.md).

## Backup

Die Redis-Daten (Zitate, Geburtstage, Sportdaten, Ruhmeshalle) liegen nur auf dem Uberspace. Das Skript `scripts/redis-backup.sh` zieht einen Dump nach `~/backups/drache/` und hebt ihn 14 Tage auf. Die Dateien enthalten persönliche Daten (siehe [Datenhaltung](datenhaltung.md)).

**Einrichten, einmalig auf dem Uberspace.** Per `crontab -e` eintragen:

    23 4 * * * $HOME/mechanischer-gruener-drache/scripts/redis-backup.sh

Danach einmal von Hand laufen lassen und prüfen, ob eine Datei in `~/backups/drache/` liegt.

**Zurückspielen.** Das Vorgehen ist noch nicht geübt, beim ersten Mal also mit Ruhe und einer Kopie des aktuellen Standes:

1. `supervisorctl stop drache`
2. Redis stoppen, damit es beim Beenden nicht den alten Stand schreibt: `supervisorctl stop redis`
3. Den Dump als `dump.rdb` in das Datenverzeichnis von Redis kopieren (Wert von `dir` in der Redis-Konfiguration, üblicherweise `~/.redis/`).
4. `supervisorctl start redis`, dann `supervisorctl start drache`
5. `/diagnose` aufrufen.

**Grenze:** Das Backup liegt auf demselben Host. Es schützt vor kaputten Daten und Fehlbedienung, nicht vor dem Verlust des Hosts. Für das zweite müsste der Dump regelmäßig woandershin kopiert werden.
