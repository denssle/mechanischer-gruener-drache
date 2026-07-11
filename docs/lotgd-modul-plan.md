# Plan: LotGD-Modul „Drachenbot-Token" (Prototyp zum Vorlegen)

> Status: **geplant, noch nicht begonnen.** Ziel: Ein fertiger, review-barer Prototyp eines
> LotGD-Moduls, das Spielern im Spiel ein widerrufbares Read-Only-Token ausstellt, mit dem sich
> der Discord-Bot authentifizieren kann. Der Prototyp wird den lotgd.de-Betreibern **vorgelegt**
> (nicht nur beschrieben) – vorzeigbarer Code beantwortet die Vertrauensfrage besser als eine
> Anfrage. Hintergrund und warum alle anderen Auth-Wege Sackgassen sind:
> `docs/spiel-interaktion-idee.md` (Update 2026-07-11).

## Die Idee in einem Absatz

Ein LotGD-Modul (`modules/drachenbot.php`) hängt einen Punkt in die Spieler-Einstellungen: „Token
für den Discord-Bot erzeugen". Der Spieler generiert das Token **eingeloggt im Spiel**, kopiert es
und hinterlegt es per `/charakter` beim Bot. Der Bot ruft damit einen kleinen Read-Only-Endpunkt
auf und bekommt die freigegebenen Charakterdaten als JSON. Kein Passwort, kein Session-Cookie,
jederzeit im Spiel widerrufbar. Damit fällt alles weg, woran Stufe 2 bisher gescheitert ist:
kein login-äquivalentes Geheimnis bei uns, kein 15-Minuten-Session-Timeout, kein Verfälschen der
Online-Liste – und JSON statt ISO-8859-1-Regex-Parsing.

## Rahmenbedingungen (bekannt, nicht neu prüfen)

- lotgd.de läuft auf **LotGD 1.2.0 Dragonprime Edition** (klassisches PHP, MySQL, ISO-8859-1).
- Quellcode ist über `source.php` öffentlich beziehbar (GPL-Pflicht der Instanz).
- Betreiber-Haltung: grünes Licht für Anbindungen, aber **null Kapazität** – sie werden nichts
  selbst bauen. Ein Modul einspielen ist eine neue, größere Bitte als „von außen scrapen":
  unser Code liefe auf ihrem Server mit vollem DB-Kontext. Genau deshalb der Prototyp-Weg:
  klein, lesbar, mit Doku, die genau sagt, was er tut und was nicht.

## Vorgehen Schritt für Schritt

### Phase 0 – Referenzcode beschaffen und Modul-API verifizieren

1. Quellcode der laufenden Version über `source.php` herunterladen (mit Bot-User-Agent, wie
   immer bei lotgd.de).
2. Gegen den **echten** Code verifizieren (nicht gegen Foren-Wissen zu anderen 1.x-Versionen):
   - Modul-Gerüst: `<modulname>_getmoduleinfo()`, `_install()`, `_uninstall()`, `_dohook()`,
     `_run()` – exakte Signaturen und erwartete Rückgaben.
   - Prefs-System: `set_module_pref()`/`get_module_pref()` und die zugehörige Tabelle
     (`module_userprefs`) – dort landet der Token-Hash pro Account.
   - Welche Hooks es für die Spieler-Einstellungen gibt (Dragonprime kennt u.a. einen
     Prefs-Hook, mit dem Module eigene Einstellungsfelder/Links beisteuern) bzw. wie ein
     eigener Navigationspunkt sauber ergänzt wird (`addnav` in einem Village-/Hütte-Hook).
   - DB-Zugriffsschicht (`db_query`, Escaping-Konventionen) und wie `common.php` initialisiert
     wird, **ohne** den Login zu erzwingen (wichtig für Phase 3).
3. Festhalten, welche PHP-Version der Code voraussetzt bzw. verträgt → bestimmt Phase 1.

**Ergebnis:** kurze Notiz (Abschnitt in diesem Dokument), welche API-Aufrufe der Prototyp benutzt.

#### Phase-0-Ergebnisse (2026-07-11, erledigt)

**Quelle:** `source.php` auf lotgd.de gibt den Instanz-Code **nicht** mehr heraus (Zugriff nach
Missbrauch eingeschränkt), verweist stattdessen auf das Forum **dragonprime-reborn.ca**. Dort im
Bereich „Game Downloads" (f=11, Topic t=2) liegt als Anhang **`lotgd-1-1-2-dragonprime-e.zip`**
(„1.1.2 Dragonprime Edition BUGS_FIXED", ~1 MB, plus `lotgddb.zip` mit dem DB-Schema). lotgd.de
meldet sich als „1.2.0 Dragonprime Edition" – die 1.1.2 ist die letzte veröffentlichte Stable,
die Modul-API ist dieselbe (beim Review mit den Betreibern gegenchecken). Im selben Forum gibt es
außerdem ein Topic **„LotGD Dragonprime 1.1.2 Docker Edition"** (t=1029) – direkt relevant für
Phase 1.

**Die wichtigste Erkenntnis – Phase 3 wird einfacher als geplant:** `runmodule.php` erzwingt den
Login **nicht** bedingungslos. Es liest aus `_getmoduleinfo()` die Flags `allowanonymous` und
`override_forced_nav` – ein Modul, das `"allowanonymous" => true` deklariert, ist **ohne Login**
über `runmodule.php?module=drachenbot&op=api` erreichbar. Genau so laufen die öffentlichen Module
auf lotgd.de (`legalinfo`, `dataprotection`; deren Seiten tragen den Kommentar
`AllowAnonymous: True`) – der Mechanismus ist also auf der Live-Instanz nachweislich aktiv.
**Damit entfällt die separate Datei im Spiel-Root komplett:** der ganze Prototyp ist **eine**
Moduldatei über den Standard-Mechanismus, nichts außerhalb von `modules/` wird angefasst.

**Verifizierte API (gegen den echten 1.1.2-Code):**

- Modul-Gerüst wie erwartet: `<name>_getmoduleinfo()` (Array mit `name`/`version`/`author`/
  `category`, optional `allowanonymous`/`override_forced_nav`), `_install()`, `_uninstall()`,
  `_dohook($hookname,$args)`, `_run()`. Ops via `httpget('op')`, Hook-Registrierung via
  `module_addhook("<hook>")` in `_install()`.
- Prefs pro Account: `set_module_pref($name,$value)` / `get_module_pref($name)` → Tabelle
  `module_userprefs` (`modulename`,`setting`,`userid`,`value`). **Achtung:** Für die
  Token-Auflösung (Hash → Account) braucht es die **Rückrichtung** – die gibt es als Helper
  nicht, also ein direkter `SELECT` auf `db_prefix("module_userprefs")` via `db_query()`
  (Escaping: `addslashes`, wie im Kern üblich; unser Suchwert ist ohnehin ein Hex-Hash).
- Nav-Punkt für Spieler: Hook **`village`** (Standard-Muster, z.B. `outhouse.php`:
  `addnav("...","runmodule.php?module=...")` im `_dohook`). Ein spezifischer Prefs-Seiten-Hook
  existiert in 1.1.2 nicht – der Token-Punkt kommt also ins Dorf (oder `charstats`), nicht in
  die Einstellungsseite; Detail beim Bauen entscheiden.
- JSON-Ausgabe aus `_run()`: unproblematisch – das `ob_start()` in `common.php` ist bei
  Modul-Ausführung schon wieder geschlossen (`ob_end_clean()` ebenda); `header()` + `echo
  json_encode()` + `exit` im `op=api`-Zweig, bevor `page_header()` je aufgerufen wird.
- Whitelist-Felder existieren alle in der `accounts`-Tabelle: `name`, `level`, `race`, `alive`,
  `location`, `gold`, `experience`, `dragonkills`, `hitpoints`, `maxhitpoints`, `laston`.
- **PHP-Version für Phase 1: 7.4** (nicht 8.x): 61 Dateien nutzen `each()` (in 8.0 entfernt),
  dazu `get_magic_quotes` – in 7.4 alles noch lauffähig (nur deprecation-Warnungen). Die
  „BUGS_FIXED"-Edition bringt mysqli-Wrapper mit (`lib/dbwrapper_mysqli_*.php`), alte
  `mysql_*`-Abhängigkeit ist also kein Blocker. → Docker: `php:7.4-apache` + MariaDB.

### Phase 1 – Lokale Spielinstanz zum Entwickeln und Vorführen

1. Den heruntergeladenen Quellcode lokal zum Laufen bringen: PHP + MySQL/MariaDB, am saubersten
   per **Docker** (Container mit passender alter PHP-Version – klassisches LotGD 1.x läuft nicht
   auf PHP 8; welche Version genau nötig ist, sagt Phase 0).
2. Installer durchlaufen, Admin- und Test-Charakter anlegen.
3. Docker-Setup ins Repo (`lotgd-modul/docker/` o.ä.) – damit ist die Demo **reproduzierbar**
   und kann den Betreibern notfalls als Video/Screenshots gezeigt werden, ohne dass sie selbst
   etwas installieren.

**Risiko Nr. 1 des ganzen Plans lebt hier:** die PHP-Kompatibilität des alten Codes. Wenn die
lokale Instanz nicht ans Laufen kommt, ist der Rest blockiert – deshalb diese Phase früh und
komplett vor dem Modulbau.

#### Phase-1-Ergebnisse (2026-07-11, erledigt)

Sandbox läuft komplett: `lotgd-modul/docker/` (php:5.6-apache + MariaDB 10.3), Spiel auf
`http://localhost:8080`, Installer per HTTP durchautomatisiert, Admin-Login `admin`/`sandbox123`.
Das Modul-Grundgerüst (`lotgd-modul/drachenbot.php`, per Volume in `modules/` gemountet) ist
installiert + aktiv; verifiziert sind bereits **beide Kernpfade**: der anonyme API-Zweig
(`runmodule.php?module=drachenbot&op=api` liefert ohne Login JSON mit korrektem Content-Type)
und die eingeloggte Modulseite über den Dorf-Nav-Punkt. Drei Stolpersteine, alle gelöst und im
Setup verankert:

- **PHP 5.6 statt 7.4** (Revision der Phase-0-Aussage): `lib/dbwrapper.php` verdrahtet `DBTYPE`
  hart auf die alte `mysql_*`-Extension (ab PHP 7 entfernt). 5.6 fährt den Stock-Code
  unverändert; 7.4-Weg im Docker-README dokumentiert. Konsequenz: **Modulcode PHP-5-kompatibel
  halten** (lotgd.de könnte ebenfalls altes PHP fahren).
- **MariaDB braucht `--sql-mode=`** (leer, steht im Compose): `STRICT_TRANS_TABLES` verwirft die
  alten LotGD-INSERTs (füllen nicht alle NOT-NULL-Spalten) – der Installer meldet dann z.B.
  „Admin angelegt", obwohl die `accounts`-Tabelle leer bleibt.
- `date.timezone` + `default_charset=ISO-8859-1` müssen in der php.ini gesetzt sein (steht im
  Dockerfile), sonst Warnungs-Spam bzw. kaputte Umlaute.

### Phase 2 – Das Modul: Token-Verwaltung im Spiel

Eine Datei `modules/drachenbot.php`, bewusst klein und in einem Review-Durchgang lesbar:

1. **Navigationspunkt** in den Spieler-Einstellungen (bzw. der Hütte, je nachdem was Phase 0
   als saubersten Hook ergibt): „Discord-Bot-Verknüpfung".
2. **Token erzeugen:** kryptografisch zufällig (`random_bytes(16)` → hex; Fallback je nach
   PHP-Version aus Phase 0). Dem Spieler wird das Token **einmalig** angezeigt („kopiere es
   jetzt in Discord: `/charakter token`"); gespeichert wird **nur der Hash** (`sha256`) als
   Modul-Pref. Ein DB-Leak auf Spielseite verrät damit keine gültigen Tokens.
3. **Widerrufen / neu erzeugen:** ein Klick löscht bzw. ersetzt den Hash – alte Tokens sind
   sofort ungültig. Das ist das zentrale Versprechen an die Spieler: die Kontrolle bleibt im
   Spiel, nicht beim Bot.
4. **`_uninstall()` räumt rückstandsfrei auf** (alle Modul-Prefs weg). Für die Betreiber ist
   „lässt sich spurlos entfernen" ein echtes Argument.
5. Kein Schreiben an Spieldaten, keine Superuser-Funktionen, keine Hooks in Spielmechanik.

### Phase 3 – Der Read-Only-Endpunkt

~~Ursprüngliche Annahme: `runmodule.php` erzwingt Login, es braucht eine separate Datei im
Spiel-Root.~~ **Phase 0 hat das widerlegt:** Module können sich per `"allowanonymous" => true`
selbst login-frei schalten (Standard-Mechanismus, auf lotgd.de live in Benutzung). Der Endpunkt
ist also ein **`op=api`-Zweig im selben Modul** – keine zweite Datei, nichts im Spiel-Root:

1. **Request:** `GET runmodule.php?module=drachenbot&op=api&token=<token>`. Antwort **JSON, UTF-8** (Konvertierung
   aus dem ISO-8859-1 der DB im Endpunkt, damit der Bot nichts dekodieren muss).
2. **Auth:** Token hashen, per Konstantzeit-Vergleich (`hash_equals`) gegen die Modul-Prefs
   auflösen. Kein Treffer → `401`, generische Meldung, **keine** Unterscheidung „Token existiert
   nicht" vs. „widerrufen" (kein Orakel).
3. **Antwortdaten: feste Whitelist**, im Code verdrahtet und in der Doku aufgezählt – der
   Startvorschlag: Name, Level, Rasse, lebendig/tot, Aufenthaltsort, Gold, Erfahrung,
   Drachentötungen, Lebenspunkte. Die endgültige Liste entscheiden die **Betreiber** beim
   Review – deshalb Whitelist statt „alles außer Passwort".
4. **Kein Schreiben, keine Session:** Der Endpunkt startet keine Spielsitzung (der Spieler
   taucht **nicht** als „online" auf – das war der K.o. der Session-Token-Idee), fasst nur
   `SELECT` an und loggt nichts Personenbezogenes.
5. **Bremse gegen Missbrauch:** simples Rate-Limit (z.B. pro IP wenige Requests/Minute, in
   der Modul-Prefs- oder einer kleinen eigenen Tabelle) – muss nicht raffiniert sein, nur
   „kein Brute-Force auf Tokens" glaubhaft machen.

#### Phase-2+3-Ergebnisse (2026-07-11, erledigt)

Beide Phasen sind in `lotgd-modul/drachenbot.php` umgesetzt und in der Sandbox end-to-end
getestet (UI-Flow per HTTP durchgespielt, DB gegengeprüft):

- **Token-Verwaltung:** erzeugen (einmalige Anzeige, DB speichert nur den sha256-Hash –
  per Gegenprobe verifiziert), neu erzeugen, widerrufen (leert die Prefs; das Token ist
  **sofort** an der API ungültig, getestet). Zufallsquelle `random_bytes` →
  `openssl_random_pseudo_bytes`-Fallback; eigener `hash_equals`-Fallback – alles
  **PHP-5-kompatibel** (gelintet mit `php -l` unter 5.6).
- **API:** `op=api&token=<32 hex>` → JSON (UTF-8, Farbcodes aus dem Namen gestrippt).
  Whitelist: name, level, race, sex, alive, location, gold, gems, experience, dragonkills,
  hitpoints, maxhitpoints, laston. Format-Check wirft alles Nicht-Hex vor dem SQL raus
  (Injection-Test bestanden); Hash-Vergleich in PHP über **alle** Zeilen (konstante Zeit);
  Fehlerantwort generisch 401 + 0,5-s-Bremse gegen Raten. Kein Schreiben, keine Session –
  der Spieler erscheint durch API-Aufrufe nicht als online.
- **Zwei Sandbox-Stolperfallen dokumentiert** (docker/README): Einzeldatei-Bind-Mounts
  hängen am Inode (nach Änderungen `up -d --force-recreate web`, `restart` reicht nicht);
  und beim Testen nicht von der per Login-Restore angezeigten Seite täuschen lassen – LotGD
  zeigt da den **gespeicherten** letzten Seitenstand aus `accounts_output`, nicht frisch
  gerenderten Code (frisch übers Dorf navigieren).

### Phase 4 – Bot-Seite: minimaler Beweis, kein Vollausbau

Bewusst schlank – die Bot-Integration wird erst richtig gebaut, wenn das Modul live ist:

1. Ein Testskript (`scripts/test-modul-api.ts`, kompiliert wie `test:twitch` über
   `tsconfig.scripts.json` – **kein ts-node**) ruft den Endpunkt der lokalen Instanz auf und
   zeigt die JSON-Antwort. Das ist der End-to-End-Beweis für die Demo.
2. Skizze (nur Doku, kein Code): `/charakter token <token>` speichert das Token pro Discord-User
   (Redis, `CHARACTER:TOKEN:{discordId}`), `/charakter anzeigen` bevorzugt dann die
   API-Daten und fällt ohne Token auf das heutige Roster-Scraping zurück. Gleiche
   Fehlertoleranz-Linie wie überall: Endpunkt nicht erreichbar → alte Anzeige, kein Crash.

### Phase 5 – Paket schnüren und vorlegen

1. **README für die Betreiber** (deutsch, im Modul-Verzeichnis): Was es tut, was es **nicht**
   tut (kein Schreiben, keine Passwörter, keine Session), exakte Feld-Whitelist, Installation
   (zwei Dateien kopieren, Modul im Admin aktivieren), Deinstallation, wie Spieler widerrufen.
   Explizit: Whitelist und alles andere sind verhandelbar, Review erwünscht.
2. **Demo-Material:** Screenshots aus der lokalen Instanz (Einstellungsseite, Token-Anzeige,
   JSON-Antwort) – die Betreiber sollen es beurteilen können, ohne es zu installieren.
3. **Anschreiben** formulieren: kurz, konkret, mit dem Code als Anhang/Link. Kernbotschaft:
   fertig, klein, read-only, rückstandsfrei entfernbar, ihr habt die letzte Entscheidung über
   jede Zeile. **Konkreter Vorschlag im Anschreiben:** Es gibt einen Dev-Server
   (`dev.lotgd.de`, ebenfalls 1.2.0 Dragonprime, `source.php` dort genauso gesperrt –
   geprüft 2026-07-11) – anbieten, das Modul zuerst **dort** einzuspielen. Damit können die
   Betreiber es risikofrei am echten 1.2.0-Stand testen (und ein etwaiger 1.1.2↔1.2.0-Drift
   fällt dort auf, nicht in Produktion).
4. Übergabe durch Dominik (bestehender Draht zu den Entwicklern).

## Ablage im Repo

Alles unter **`lotgd-modul/`** in diesem Repo (Modul, Endpunkt, Docker-Setup, Betreiber-README).
Eigenes Verzeichnis außerhalb von `src/` – vitest (`include: src/**`) und der TypeScript-Build
fassen es nicht an. Ein separates Repo lohnt erst, wenn die Betreiber zusagen und den Code
eigenständig weiterpflegen wollen.

## Bewusst außerhalb des Prototyps

- **Schreibende Aktionen (Stufe 3)** – bleibt liegen wie in `spiel-interaktion-idee.md` begründet.
- **Push-Variante** (Modul sendet Webhooks an unseren Server, statt dass der Bot pollt): als
  Alternative im Hinterkopf, falls der anonyme Endpunkt den Betreibern nicht gefällt – aber
  nicht im Prototyp, das würde ihn verdoppeln.
- **Bot-Vollintegration** (`/charakter`-Umbau) – erst nach Zusage und Live-Gang des Moduls.

## Reihenfolge und Abbruchkriterien

Die Phasen sind strikt sequenziell: 0 → 1 → 2 → 3 → 4 → 5. Zwei ehrliche Ausstiegspunkte:

- **Phase 1 scheitert** (alte Codebasis lokal nicht lauffähig zu bekommen): dann können wir den
  Prototyp nicht seriös testen → Umschwenken auf „nur Konzept + Code-Entwurf vorlegen" (schwächer,
  aber besser als ungetesteten Code als getestet zu verkaufen).
- **Betreiber lehnen ab:** Der Aufwand bis dahin ist nicht verloren – das Modul dokumentiert
  präzise, was wir wollten, und `spiel-interaktion-idee.md` bekommt den Schlussstrich unter
  Stufe 2. Kein Nachbohren; ihre Instanz, ihre Entscheidung.
