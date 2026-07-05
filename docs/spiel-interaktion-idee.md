# Idee: Mit dem Spiel selbst interagieren

> Status: **Idee / Machbarkeitsnotiz** – noch keine Entscheidung, noch kein Code.
> Wunsch: Über den Bot direkt mit dem eigentlichen LotGD-Spiel auf lotgd.de interagieren
> (nicht nur Community-Spielereien drumherum). Diese Notiz hält fest, **warum das schwierig
> ist**, was realistisch geht und in welcher Reihenfolge man es anginge.

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
