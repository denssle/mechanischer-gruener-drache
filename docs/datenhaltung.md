# Datenhaltung

Was der Bot speichert, warum, wie lange – und was er bewusst **nicht** speichert.

Gedacht als ehrliche Antwort auf die Frage „was weiß der Bot eigentlich über mich?" und als
Entscheidungsgrundlage, bevor ein neues Feature anfängt, Daten zu horten.

Alles liegt in **Redis** auf dem Uberspace (Unix-Socket, nur lokal erreichbar). Kein Backup, keine
Replikation, keine Verschlüsselung im Ruhezustand – ein privater Hobby-Server, kein Enterprise-Setup.

## Leitplanken

1. **Nichts speichern, was wir nicht brauchen.** Alles, was live abrufbar ist (Spieldaten von
   lotgd.de, Discord-Profile, Twitch-Status), wird bei Bedarf geholt, nicht auf Vorrat gehalten.
2. **Keine fremden Zugangsdaten.** Siehe unten – das ist die härteste Regel.
3. **Inhalte nur befristet.** Nachrichteninhalte laufen per TTL ab und werden gelöscht, sobald sie
   ihren Zweck erfüllt haben.
4. **Kein Feature schreibt an einer Stelle, die nicht hier steht.** Neue Redis-Keys gehören in diese
   Tabelle – sonst weiß in drei Monaten niemand mehr, was da liegt.

## Was gespeichert wird

| Key | Inhalt | Lebensdauer | Wofür |
|---|---|---|---|
| `<discord-user-id>` (roh, ohne Prefix – Legacy-Format) | `StoredUser`: ID, Username, Tag, Displayname, Rollen-IDs, Beitrittsdatum | bis zum Überschreiben | Mitglieder-Tracking (`member.handler.ts`) |
| `LOGGING:CHANNEL` | Channel-ID des Audit-Logs | bis zum Überschreiben | `/protokoll` |
| `LOGGING:MESSAGE:<messageId>` | **Nachrichtentext + Autor-Tag + Dateinamen der Anhänge** | **7 Tage** (TTL), beim Löschen der Nachricht sofort weg | alter Inhalt im Lösch-/Bearbeitungs-Log (s.u.) |
| `CHARACTER:LINK:<userId>`, `CHARACTER:ALL_LINKS` | öffentlicher LotGD-Charaktername | bis `/charakter entfernen` | `/charakter`, Hervorhebung in `/online`/`/ereignisse` |
| `TWITCH:USER:*`, `TWITCH:MAPPING:*`, `TWITCH:SUBSCRIPTION:*`, `TWITCH:ALL_LINKS` | Twitch-Login ↔ Discord-User, EventSub-Subscription-IDs | bis `/twitch entfernen` (oder Revocation) | Live-Benachrichtigungen |
| `TWITCH:NOTIFICATION_CHANNEL`, `TWITCH:NOTIFICATION_ROLE` | Admin-Konfiguration | bis zum Überschreiben | Live-Benachrichtigungen |
| `SPORT:ENTRY:<id>`, `SPORT:USER:<userId>` | Sport-Einträge: Distanz, Aktivität, Datum, optionale Notiz | dauerhaft (bis `/sport loeschen`) | `/sport statistik` |
| `SPORT:HIGHSCORE`, `SPORT:MILESTONES`, `SPORT:ANNOUNCEMENT_CHANNEL` | Kilometer je User, Meilensteine, Ankündigungskanal | dauerhaft | `/sport gesamt`, Meilenstein-Ankündigungen |
| `<userId>PING_PONG`, `PING_PONG` (Sorted Set) | Ping-Pong-Punktestand | dauerhaft | `/pingpong bestenliste` |
| `PING_PONG:COOLDOWN:<userId>` | Marker, dass gerade herausgefordert wurde | 30 Sekunden (TTL) | Anti-Spam |
| `PING_PONG:SERIE:<userId>`, `PING_PONG:REKORD:<userId>` | Laufende Siegesserie (bei Niederlage gelöscht) und längste je erreichte Serie | dauerhaft | Duell-Ergebnis, `/pingpong bestenliste` |
| `TIPP:COOLDOWN:<userId>` | Marker, dass die Person heute schon einen Tipp gesehen hat | 24 Stunden (TTL) | gelegentliche Tipps/Nettigkeiten |
| `TIPP:USED_COMMANDS:<userId>` | Set der Slash-Command-**Namen**, die die Person je benutzt hat (keine Argumente, keine Inhalte, keine Zeitpunkte) | dauerhaft | Tipps nur zu noch nie benutzten Befehlen |
| `MEMBER:JOIN_COUNT:<userId>` | Zahl: wie oft die Person dem Server schon beigetreten ist | dauerhaft | Beitritts-Meldung im Audit-Log |
| `BLAHAJ:TOTAL_EUR` | eine einzige Zahl (Summe aller je erwähnten Euro-Beträge) | dauerhaft | `/blahaj` |
| `EVENT:NEXT` | Timestamp + optionaler Titel des nächsten Community-Events | bis `/event entfernen` | `/event countdown` |

## Nachrichteninhalte (seit 2026-07-11)

Bis dahin speicherte der Bot **keinen** Nachrichteninhalt: das Lösch-/Bearbeitungs-Log zeigte den
alten Text nur, wenn discord.js ihn zufällig noch im RAM-Cache hatte – nach jedem Neustart war der
leer, und ältere Nachrichten waren grundsätzlich „nicht verfügbar".

Damit das Log seinen Zweck erfüllt, schreibt der Bot Nachrichten jetzt in einen eigenen Cache. Die
bewussten Grenzen:

- **Nur wenn ein Log-Channel konfiguriert ist** (`/protokoll`). Ohne Logging speichert der Bot
  weiterhin gar nichts – das Feature abschalten heißt, dass nichts mehr anfällt.
- **7 Tage TTL.** Reicht, um nachzuvollziehen, was gerade gelöscht/geändert wurde. Kein Archiv.
- **Beim Löschen sofort weg**: Ist die Nachricht geloggt, wird der Cache-Eintrag entfernt.
- **Keine Bot-Nachrichten, keine DMs.**
- **Anhänge nur als Dateiname** („Anhang: bild.png"). Die Dateien werden nicht gespiegelt, die
  CDN-Links nicht gespeichert (die sterben ohnehin mit der Nachricht).

Das ist trotzdem eine qualitative Änderung: für 7 Tage liegt der Klartext der Server-Nachrichten in
Redis. Auf einem privaten Server mit einem Audit-Log, von dem alle wissen, ist das vertretbar – aber
es ist eine Entscheidung, keine Nebensache. Wer sie zurücknehmen will: `MESSAGE_CACHE_SECONDS` in
`logging.service.ts` senken oder die `MessageCreate`-Registrierung in `index.ts` entfernen.

## Was bewusst NICHT gespeichert wird

- **Keine LotGD-Zugangsdaten.** lotgd.de hasht das Passwort client-seitig per md5 und akzeptiert
  diesen Hash am `login.php` → der **Hash ist login-äquivalent**. „Wir speichern ja nur den Hash"
  bringt also keinen Sicherheitsgewinn. Gehortete Login-Geheimnisse Dritter sind für einen Hobby-Bot
  unverhältnismäßige Haftung. `/charakter` speichert deshalb nur den **öffentlichen Charakternamen**.
- **Auch keine Session-Tokens.** Der naheliegende Ausweg („dann hinterlegt der User halt ein Token
  statt des Passworts") wurde am 2026-07-11 geprüft und **verworfen**: `lgi` ist nur eine
  Browser-Kennung (keine Session), und `PHPSESSID` verfällt nach 15 Minuten Leerlauf. Es gibt bei
  lotgd.de nichts, das hinterlegbar, langlebig *und* harmlos wäre. Herleitung:
  `spiel-interaktion-idee.md`.
- **Keine Twitch-Tokens von Usern.** Der Bot nutzt nur seine eigenen App-Credentials (aus der
  `config.json`, nicht in Redis).
- **Keine Spieldaten auf Vorrat.** Roster, News, Online-Liste werden live gescrapt; das Roster liegt
  maximal 10 Minuten im RAM (nicht in Redis), damit `/charakter` nicht 7 Seiten pro Aufruf lädt.
- **Kein Verlauf beim Blåhaj-Zähler.** Nur die Gesamtsumme, nicht wer wann wie viel erwähnt hat.
