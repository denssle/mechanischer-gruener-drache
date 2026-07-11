# Drachenbot-Modul für LotGD (Dragonprime Edition)

Ein Modul für Legend of the Green Dragon (1.x Dragonprime Edition), mit dem Spieler dem
Discord-Bot des Community-Servers („Mechanischer Grüner Drache") **lesenden** Zugriff auf ihre
Charakterdaten geben können – über ein Token, das sie **selbst im Spiel erzeugen und jederzeit
widerrufen** können. Es werden keine Passwörter gespeichert, keine Sessions benutzt und keine
Spieldaten geschrieben.

Dieses Dokument richtet sich an die Betreiber von lotgd.de. Es beschreibt vollständig, was das
Modul tut, was es bewusst nicht tut, und wie es installiert bzw. rückstandsfrei wieder entfernt
wird. **Alles hier ist ein Vorschlag – Feld-Whitelist, Texte, Verhalten: Ihr habt bei jeder
Zeile das letzte Wort, Änderungswünsche bauen wir um.**

## Warum dieses Modul?

Der Discord-Bot zeigt der Community heute schon öffentliche Spielinfos (News, Ereignisse,
Online-Liste – per Scraping der öffentlichen Seiten). Viele möchten auch ihren eigenen
Charakter im Discord sehen. Die naheliegenden Wege dafür sind alle inakzeptabel:
Passwörter beim Bot speichern (login-äquivalent, unverhältnismäßige Haftung) oder
Session-Cookies weiterreichen (15-Minuten-Timeout, und ein Am-Leben-Halten würde Spieler
permanent „online" erscheinen lassen). Die einzig saubere Lösung ist ein **vom Spiel selbst
ausgestelltes, widerrufbares Read-Only-Token** – genau das stellt dieses Modul bereit.

## Was es tut

- **Für Spieler (eingeloggt):** Ein Navigationspunkt „Drachenbot (Discord)" im Dorf führt zu
  einer Seite mit drei Aktionen: Token erzeugen, Token neu erzeugen (altes wird ungültig),
  Token widerrufen. Das Token wird **genau einmal** angezeigt; gespeichert wird nur sein
  sha256-Hash als Modul-Pref (`module_userprefs`). Komplett opt-in – wer nichts tut, für den
  ändert sich nichts.
- **Für den Bot (anonym):** `runmodule.php?module=drachenbot&op=api&token=<token>` liefert die
  unten aufgeführten Felder als JSON (UTF-8). Das nutzt den Standard-Mechanismus
  `allowanonymous` aus `runmodule.php` – wie bei euren öffentlichen Modulen (`legalinfo`,
  `dataprotection`). **Keine Datei außerhalb von `modules/` wird angefasst.**

## Was es bewusst NICHT tut

- **Kein Schreiben.** Der API-Zweig führt ausschließlich `SELECT` aus; das Modul hängt in
  keinem Spielmechanik-Hook.
- **Keine Session.** API-Aufrufe starten keine Spielsitzung – der Spieler erscheint dadurch
  nicht in der Online-Liste, `laston` bleibt unberührt.
- **Keine Passwörter, keine privaten Spalten.** Die Feld-Whitelist ist im Code fest
  verdrahtet; `login`, `password`, E-Mail o.ä. kommen darin nicht vor.
- **Keine Superuser-Funktionen, keine Admin-Einstellungen mit Spielwirkung.**

## Die Feld-Whitelist (vollständig)

`name` (Anzeigename ohne Farbcodes), `level`, `race`, `sex`, `alive`, `location`, `gold`,
`gems`, `experience`, `dragonkills`, `hitpoints`, `maxhitpoints`, `laston`.

Jedes dieser Felder ist verhandelbar – sagt uns, was rausfliegen soll.

## Sicherheits-Design

- **In der DB liegt nur der sha256-Hash** des Tokens. Selbst ein vollständiger Dump von
  `module_userprefs` verrät keine gültigen Tokens.
- **Token-Format wird vor jedem DB-Zugriff geprüft** (exakt 32 Hex-Zeichen) – nichts anderes
  erreicht je das SQL.
- **Konstantzeit-Vergleich** (`hash_equals`, mit Fallback für PHP < 5.6) über alle
  hinterlegten Hashes, ohne frühen Abbruch.
- **Generische Fehlerantwort** (401, keine Unterscheidung „unbekannt" vs. „widerrufen") mit
  0,5 s Verzögerung als einfache Bremse gegen Durchprobieren. Bei 16 Byte Zufall
  (`random_bytes`/`openssl_random_pseudo_bytes`) ist Brute-Force ohnehin aussichtslos.
- **Widerruf wirkt sofort** – der nächste API-Aufruf mit dem alten Token bekommt 401.

## Installation

1. `drachenbot.php` nach `modules/` kopieren.
2. Im Superuser-Bereich: Module verwalten → `drachenbot` installieren und aktivieren.

Das ist alles. Keine DB-Migration, keine Konfiguration, keine weiteren Dateien.

## Deinstallation

Modul im Superuser-Bereich deinstallieren – der LotGD-Kern räumt die Modul-Prefs
(die Token-Hashes) dabei selbst aus `module_userprefs`. Es bleibt nichts zurück.

## Kompatibilität & Test

Entwickelt und end-to-end getestet gegen **LotGD 1.1.2 Dragonprime Edition** (die letzte
veröffentlichte Stable) in einer lokalen Sandbox unter **PHP 5.6** – der Code ist bewusst
PHP-5-kompatibel gehalten (Fallbacks für `random_bytes` und `hash_equals`), benutzt nur die
Standard-Modul-API (`getmoduleinfo`/`install`/`uninstall`/`dohook`/`run`, `set_module_pref`/
`get_module_pref`, `db_query`) und sollte daher unverändert auf 1.2.0 laufen.

**Vorschlag:** Zuerst auf `dev.lotgd.de` einspielen. Dort lässt es sich risikofrei am echten
1.2.0-Stand testen (wir testen gern mit), bevor es – wenn überhaupt – in die Produktion geht.

## Lizenz

Dieses Modul baut auf der Modul-API von Legend of the Green Dragon 1.x (Dragonprime Edition)
auf, das unter [CC BY-NC-SA 2.0](https://creativecommons.org/licenses/by-nc-sa/2.0/) steht.
Entsprechend der Share-Alike-Bedingung steht auch dieses Modul unter **CC BY-NC-SA 2.0**
(anders als der restliche Bot-Code in diesem Repository, der MIT-lizenziert ist).

## Kontakt

Dominik Hellweg (Betreiber des Discord-Community-Servers), dominik.hellweg@protonmail.com.
Quellcode des Bots: https://github.com/denssle/mechanischer-gruener-drache (dieses Modul liegt
dort unter `lotgd-modul/`).
