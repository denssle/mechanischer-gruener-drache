# Lokale LotGD-Sandbox (Phase 1)

Lokale Testinstanz von LotGD 1.1.2 Dragonprime Edition, um das Drachenbot-Modul zu entwickeln
und vorzuführen. Kontext: `docs/lotgd-modul-plan.md` im Repo-Root.

## Voraussetzungen

- Docker Desktop
- `spiel/` muss existieren (Arbeitskopie der Referenz, gitignored). Falls nicht:

  ```bash
  cp -r ../referenz/lotgd-1.1.2_Dragonprime_Edition_BUGS_FIXED spiel
  ```

## Starten

```bash
docker compose up -d --build
```

Danach läuft das Spiel auf **http://localhost:8080**.

## Zugangsdaten der laufenden Sandbox

Die Erstinstallation wurde am 2026-07-11 bereits durchgeführt: Admin-Account **`admin`** /
**`sandbox123`** (nur lokal, kein echtes Geheimnis). Das Drachenbot-Modul ist installiert und
aktiv, erreichbar im Dorf („Drachenbot (Discord)") bzw. anonym unter
`runmodule.php?module=drachenbot&op=api`. Die folgenden Schritte braucht man nur nach einem
`docker compose down -v` (DB weg) erneut.

## Erstinstallation (einmalig)

1. `http://localhost:8080/installer.php` aufrufen und dem Installer folgen.
2. DB-Zugangsdaten (aus `docker-compose.yml`):
   - Host: `db`
   - Datenbank: `lotgd`
   - User: `lotgd`
   - Passwort: `lotgd`
3. Admin-Account anlegen, Installation abschließen.
4. Im Spiel als Admin: Grotte → Module verwalten → `drachenbot` installieren + aktivieren.

Die DB liegt im benannten Volume `dbdata` und überlebt `docker compose down`
(weg erst mit `docker compose down -v`).

## Modul entwickeln

`../drachenbot.php` ist direkt nach `modules/drachenbot.php` gemountet – Änderungen sind ohne
Neustart sofort wirksam (LotGD lädt Moduldateien pro Request). Nur bei Änderungen an
`_getmoduleinfo`/`_install` (Hooks, Settings) muss das Modul im Admin-Bereich einmal
deinstalliert/reinstalliert bzw. „reinstalled" werden.

## Warum PHP 5.6?

Der Stock-Code setzt `DBTYPE` in `lib/dbwrapper.php` hart auf `"mysql"` – die alte
`mysql_*`-Extension existiert ab PHP 7 nicht mehr. PHP 5.6 fährt den unveränderten Code und ist
damit die authentischste Umgebung. Wer stattdessen PHP 7.4 will: in `spiel/lib/dbwrapper.php`
`DBTYPE` auf `'mysqli_proc'` stellen und im `Dockerfile` das Base-Image tauschen.
Wichtig fürs Modul selbst: lotgd.de könnte ebenfalls altes PHP fahren – der Modulcode bleibt
deshalb bewusst PHP-5-kompatibel (kein `random_bytes` ohne Fallback, kein moderner Syntax-Zucker).
