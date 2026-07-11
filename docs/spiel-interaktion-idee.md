# Idee: Mit dem Spiel selbst interagieren

> Status: **teils umgesetzt.** Wunsch: Über den Bot direkt mit dem eigentlichen LotGD-Spiel auf
> lotgd.de interagieren (nicht nur Community-Spielereien drumherum). Diese Notiz hält fest, warum
> das schwierig ist, was realistisch geht und in welcher Reihenfolge man es anginge.

## Update 2026-07-10 (was sich geändert hat)

- **Blocker 2 (Betreiber-OK) ist erledigt:** Die lotgd.de-Entwickler haben grünes Licht gegeben –
  wir dürfen anbinden, was wir wollen. Aber **kein Support/keine Kapazitäten** von ihrer Seite
  (keine API, keine Vorwarnung bei HTML-Änderungen). Robustheit liegt komplett bei uns.
- **Stufe 1 (öffentlich, read-only) ist gebaut:** `/news`, `/ereignisse` (beide aus `news.php`) und
  `/online` (aus `list.php`, die eingeloggten Spieler).
- **Credential-Frage entschieden (vorerst): keine User-Passwörter.** Grund: lotgd.de hasht das
  Passwort schon im Browser per `md5()` und akzeptiert diesen Hash am `login.php`-Endpoint → der
  **Hash ist login-äquivalent**, „wir speichern nur den Hash" bringt also **keinen** Sicherheits-
  gewinn. Für einen Hobby-Bot auf Shared Hosting sind login-äquivalente Geheimnisse Dritter eine
  unverhältnismäßige Haftung. Deshalb: **Weg A** (nur öffentlicher Charaktername, kein Login).

## Update 2026-07-11: Machbarkeit „Session-Token statt Passwort" (Stufe 2) – geprüft, **Sackgasse**

Die Idee für Stufe 2 war: Der User hinterlegt **selbst** ein Session-Token (statt eines Passworts),
der Bot benutzt es lesend. Die Frage war, was man dafür überhaupt hinterlegen würde. lotgd.de setzt
zwei Cookies – beide wurden geprüft, das Ergebnis erledigt die Idee.

**`lgi` ist KEIN Login-Cookie.** Das war die Sorge (in vielen LotGD-Foren klingt es nach
„eingeloggt bleiben"), sie ist **unbegründet**. Im Quellcode (`common.php`, LotGD 1.x) ist `lgi`
schlicht eine **Browser-Kennung** – `md5(microtime())`, gespeichert als `uniqueid` beim Account,
dient der Mehrfach-Account-Erkennung:

```php
$u = md5(microtime());
...
else if (isset($_COOKIE['lgi'])) { $session['user']['uniqueid'] = $_COOKIE['lgi']; }
else { $_COOKIE['lgi'] = $u; $session['user']['uniqueid'] = $u; }
```

Bestätigt gegen die echte Seite: Ein **anonymer** Request auf `source.php` bekommt sofort ein
`lgi=8436c53b…` gesetzt (1 Jahr gültig) – ohne jeden Login. Der Cookie enthält also **kein**
Geheimnis und **keine** Session; er nützt uns für Auth exakt nichts (und ist umgekehrt auch
ungefährlich).

**Der echte Login steckt nur in `PHPSESSID`** – einer ganz normalen PHP-Session, serverseitig. Und
genau daran scheitert das Feature, aus zwei unabhängigen Gründen:

1. **15 Minuten Leerlauf, dann tot.** `common.php` erzwingt einen Login-Timeout
   (`getsetting("LOGINTIMEOUT", 900)` = 900 Sekunden): liegt der letzte Zugriff länger zurück, wird
   die Session verworfen. Ein Token, das der User aus den DevTools kopiert, ist also nach einer
   Viertelstunde Nichtstun wertlos. Ein Feature, das man mehrmals täglich per F12 neu einrichtet,
   benutzt niemand.
2. **Am-Leben-Halten wäre schlimmer als das Problem.** Der naheliegende Ausweg – der Bot pollt alle
   paar Minuten und hält die Session frisch – hat einen **im Spiel sichtbaren** Nebeneffekt: der
   User gilt dauerhaft als eingeloggt (steht permanent in der Kriegerliste/„Online"-Liste), und die
   Bot-Session kollidiert mit seiner echten Browser-Session. Wir würden also fremdes Spielgeschehen
   verfälschen, um an eine Zahl zu kommen.

**Fazit:** Es gibt bei lotgd.de **kein** Token, das gleichzeitig (a) hinterlegbar, (b) langlebig und
(c) harmlos ist. Was langlebig wäre (Passwort/md5-Hash), ist login-äquivalent; was harmlos ist
(`lgi`), taugt nicht zur Auth; was tatsächlich authentifiziert (`PHPSESSID`), lebt 15 Minuten.
Sauber lösbar wäre das nur mit einem **vom Betreiber ausgestellten, widerrufbaren Read-Only-Token** –
das existiert nicht, und die Entwickler haben klar gesagt, dass sie keine Kapazität haben, so etwas
zu bauen.

**Konsequenz: Stufe 2 und 3 bleiben liegen** – nicht aus Bequemlichkeit, sondern weil jeder Weg
dorthin entweder fremde Login-Geheimnisse horten oder in fremde Spielsitzungen eingreifen würde.
Wer das später nochmal aufgreift: Bitte hier anfangen, nicht bei „ach, ein Token wird schon gehen".

**Nachtrag (ebenfalls 2026-07-11):** Der eine saubere Weg – das widerrufbare Read-Only-Token vom
Betreiber – wird nun doch verfolgt, aber andersherum: **wir** bauen das ausstellende LotGD-Modul
selbst als Prototyp und legen es den Betreibern fertig vor. Plan: `docs/lotgd-modul-plan.md`.

### Machbarkeit Weg A – was lotgd.de ohne Login pro Charakter hergibt

Geprüft am 2026-07-10 (Bot-User-Agent, sonst `403`): Die **paginierte Kriegerliste**
`list.php?op=bypage&page=N` ist ein **vollständiges öffentliches Charakterverzeichnis** – alle
~695 Charaktere (7 Seiten à 100, auch offline), alphabetisch nach Kern-Namen. Spalten:
**Gilde · Name · Ort · Level · Rasse · Geschlecht · Lebt · „Zuletzt da"** (z.B. „Heute", „5 Tage").

- **Keine öffentliche Charakter-Detailseite:** Namen verlinken nirgendwohin, `about.php` ist nur
  „Über das Spiel". Alles **Private** (Gold, genaue Kampfwerte, Ingame-Post, Ausrüstung) steckt
  hinter dem Login und ist mit Weg A **nicht** erreichbar.
- **Titel-Präfix-Falle:** Der angezeigte Name trägt einen level-/drachenabhängigen Titel vorn
  („Centurio Acaine", „Grünwicht Adalbert", manche ganz ohne). Der eigentliche Charaktername ist
  nur das/die letzte(n) Wort(e). Verknüpfung/Suche muss darauf matchen (Suffix), nicht auf den
  ganzen String – sonst bricht die Zuordnung, sobald sich der Titel ändert.

### Geplantes Feature: `/charakter` (Weg A)

Gruppen-Command (darf daher ein `hilfe`-Subcommand haben, konsistent mit `/sport`/`/twitch`):

- `/charakter verknuepfen name:<Charaktername>` – speichert **nur den öffentlichen Namen** pro
  Discord-User (`CHARACTER:LINK:{discordId}`), gleiches Vertrauensmodell wie `/twitch verknuepfen`.
  Prüft beim Verknüpfen, ob der Name im Roster existiert (Tippfehler abfangen).
- `/charakter [anzeigen] [name:]` – Charakter-Karte (Level, Rasse, Ort, Gilde, lebendig, zuletzt
  gesehen); ohne `name` der eigene verknüpfte.
- `/charakter entfernen` – Verknüpfung löschen.
- `/charakter hilfe` – Detail-Hilfe; `/hilfe` verweist im „Spielwelt"-Block darauf.

Service `character.service.ts`: `parseRoster(html)` (8 Spalten, `htmlToText` für Regenbogen-Namen,
`null` bei kaputtem Markup), `findCharacter(name)` mit Suffix-Match gegen den Titel-Präfix. Roster
kurz cachen (Redis, TTL ~10 min), sonst 7 Seiten-Fetches pro Aufruf. Alles fehlertolerant (kein
Crash, klare „nicht gefunden"/„konnte nicht abrufen"-Meldung). **Keine Credentials, kein Schreiben.**

Die **privaten** Daten (Stufe 2) und **Aktionen** (Stufe 3) bleiben bewusst zurückgestellt – siehe
unten. Falls je gewünscht, dann Stufe 2 mit **selbst hinterlegtem Session-Token** (opt-in), nicht
mit gespeichertem Passwort.

---

_Die folgende Analyse ist der ursprüngliche Stand (vor dem Update oben) und bleibt als Kontext für
Stufe 2/3 stehen._

## Die Ausgangslage

lotgd.de ist eine **serverseitig gerenderte PHP-Seite** – es gibt **keine API, keinen Feed,
kein JSON**. Alles läuft über HTML-Seiten und Formulare. Der Bot müsste also **scrapen und
Formulare abschicken** wie ein Browser. Das kennen wir schon vom `/news`-Feature
(`news.service.ts`): `fetch` → `arrayBuffer()` → `new TextDecoder('iso-8859-1')` (die Seite
ist **ISO-8859-1**, nicht UTF-8) → Regex-Parsing → bei Fehler `null`. Diese Grundtechnik ist
die Basis, auf der alles Weitere aufbauen würde.

Der Unterschied: `/news` liest eine **öffentliche, anonyme** Seite. „Mit dem Spiel
interagieren" heißt dagegen **eingeloggt, pro User, und schreibend** – und da kommen drei
Blocker, in absteigender Schwere.

## Blocker 1 (der Killer): Auth & Zugangsdaten

Um im Spiel *als ein bestimmter User* etwas zu tun, braucht der Bot dessen **eingeloggte
Session**. LotGD läuft über klassische **PHP-Session-Cookies** (`PHPSESSID`) nach einem
Login-Formular. Zwei denkbare Wege, beide unschön:

1. **Der Bot speichert LotGD-Zugangsdaten der User** (User/Passwort), loggt sich für sie ein.
   → Für ein Hobby-Projekt **heikel bis inakzeptabel**: fremde Spiel-Passwörter im Klartext/
   entschlüsselbar in Redis zu halten ist ein Vertrauens- und Sicherheitsproblem. Selbst mit
   Verschlüsselung bleibt der Bot ein lohnendes Ziel und die Betreiber-/Nutzererwartung wird
   gesprengt.
2. **Jeder User hinterlegt selbst ein Session-Token / Cookie**, das der Bot nur weiterreicht.
   → Datenschutz-freundlicher (kein Passwort beim Bot), aber **umständlich** (Cookie aus dem
   Browser kopieren) und Sessions **laufen ab** → ständiges Neu-Hinterlegen.

In beiden Fällen bräuchte es einen **Cookie-Jar pro Discord-User** (Redis, `GAME:SESSION:{id}`
o.ä.), inkl. Ablauf-Handling. **Das ist die eigentliche Gating-Entscheidung** – ohne eine
saubere, vertretbare Antwort darauf sollte man Stufe 2/3 (s.u.) gar nicht erst bauen.

## Blocker 2: Einverständnis / Spielregeln

Das Spiel per Bot zu automatisieren kann gegen die **Nutzungsbedingungen** von lotgd.de
verstoßen (viele Browsergames verbieten Automatisierung/Bots ausdrücklich, u.a. wegen
Fairness/Serverlast). Bevor irgendwas gebaut wird: **mit dem/den Betreiber(n) von lotgd.de
klären**, ob das erwünscht/geduldet ist – idealerweise deren ausdrückliches OK. Die Community
steht der Seite nahe, das Gespräch ist also realistisch führbar und sollte **vor** dem Code
kommen, nicht danach.

## Blocker 3: Fragilität (Scraping schreibend)

`/news` ist schon „fragil by design" (bricht, wenn lotgd.de sein HTML ändert), fällt aber
sauber auf „konnte nicht abrufen" zurück. Bei **schreibenden Aktionen** ist das ungleich
riskanter:

- Formulare haben oft **versteckte Nonce-/CSRF-Felder** pro Seitenaufruf, die man erst
  mitparsen und wieder mitschicken muss.
- Aktionen sind GET/POST auf Endpunkte wie `run.php?op=…` mit spielinternem State – ein falsch
  geratener Parameter kann im Spiel **echten, ungewollten Schaden** anrichten (Kämpfe, Käufe,
  verbrauchte Züge), nicht nur eine leere Antwort.
- Jede HTML-Änderung seitens lotgd.de kann eine Aktion **still ins Leere** laufen lassen.

## Was realistisch geht – gestuft

**Stufe 1 – Öffentliche, anonyme Spielinfos (read-only).** Genau das `/news`-Muster auf weitere
öffentliche Seiten ausweiten (z.B. öffentliche Ranglisten/„wer ist online"/Server-Status, falls
ohne Login abrufbar). **Kein Auth, kein Schreiben** → keiner der drei Blocker greift, geringes
Risiko. Das ist der sinnvolle erste Schritt, wenn überhaupt.

**Stufe 2 – Persönliche Leseabfragen (pro User, eingeloggt).** „Zeig mir meine Charakterwerte /
mein Gold / meinen Status." Braucht **Blocker 1** gelöst (Session pro User), aber **nur lesend**
→ Blocker 3 bleibt harmlos (kaputtes Parsing = leere Anzeige, kein Spielschaden). Mittelschwer.

**Stufe 3 – Aktionen im Spiel (pro User, schreibend).** „Führe im Spiel Aktion X aus." Alle drei
Blocker in voller Härte (Session **und** Nonce-Handling **und** echter State-Schaden bei Fehlern
**und** ToS). Der teuerste, riskanteste Teil – nur mit Betreiber-OK und sehr sorgfältig.

## Technische Bausteine (falls man Stufe 2+ angeht)

- **Cookie-Jar pro User** in Redis (`GAME:SESSION:{discordUserId}`), Session-Ablauf erkennen und
  sauber „bitte neu einloggen" melden.
- **Login-Handler**: POST aufs Login-Formular, `Set-Cookie` (`PHPSESSID`) extrahieren und halten.
  `fetch` folgt Redirects/Cookies nicht automatisch wie ein Browser – Cookies **manuell** aus
  den Response-Headern ziehen und bei Folge-Requests im `Cookie`-Header mitschicken.
- **Nonce/CSRF**: vor jeder Aktion die Zielseite laden, versteckte Formularfelder rausparsen,
  beim POST mitschicken.
- **ISO-8859-1** durchgängig (wie `/news`), sonst kaputte Umlaute.
- **Fehler = `null`/klare Meldung**, niemals Crash (wie im ganzen Bot üblich).
- **Kein Passwort im Klartext** – wenn überhaupt Zugangsdaten, dann verschlüsselt, und selbst
  das nur, wenn die Community das explizit will.

## Empfehlung

1. **Zuerst reden, dann bauen:** Betreiber-OK einholen (Blocker 2), sonst lässt man es bleiben.
2. **Klein anfangen:** Stufe 1 (öffentliche read-only Infos) liefert schnell Nutzen ohne die
   heiklen Teile und ist praktisch eine `/news`-Variante.
3. **Credentials-Frage bewusst entscheiden**, bevor Stufe 2/3 überhaupt geplant wird – das ist
   der Knackpunkt, nicht das Scraping an sich.

## Offene Fragen (vor dem Start zu klären)

- Gibt es ein **OK der lotgd.de-Betreiber** für Bot-Zugriff? (blockierend)
- Soll der Bot **pro User handeln** oder reichen **öffentliche Infos für alle**? Das entscheidet,
  ob man je Blocker 1 anfassen muss.
- Falls pro User: **gespeichertes Passwort** (bequem, heikel) oder **selbst hinterlegtes
  Session-Token** (umständlicher, sauberer)? – bewusst wählen.
