# Zitatsammlung (`/bash` + Rechtsklick, seit 2026-08-25)

- Zweck: gute Sprüche aus dem Chat festhalten und später wieder hervorholen – Vorbild ist die
  `!quote`-Funktion aus Twitch-Chats (Wunsch aus der Community). Jedes Zitat trägt eine **Nummer**,
  über die es zitierbar ist. Der Name ist bewusst „Bash" (wie bash.org), nicht „Zitat".
- Dateien: `bash.service.ts`, `bash.handler.ts`, `bash.command.ts`, `bashSpeichern.kontext.ts`
  (Kontextmenü-Definition) und `commands/kontextmenues.ts` (deren Registrierungsliste).

## Erfassen läuft über das Kontextmenü, nicht über einen Befehl

- Der ursprüngliche Wunsch war „auf die Nachricht antworten und dann den Befehl schreiben".
  **Das geht mit einem Slash-Command nicht:** Discord gibt einer Slash-Interaktion keinerlei Bezug
  zur zitierten Nachricht. Möglich wären nur ein **Präfix-Textbefehl** (der Bot hat keinen einzigen,
  bräuchte also einen neuen Message-Listener) oder das **Nachrichten-Kontextmenü** – Rechtsklick auf
  die Nachricht → Apps → „Als Bash-Zitat speichern" (mobil: gedrückt halten). Entschieden wurde das
  Kontextmenü: Discord-nativ, kein Listener, und es kann vor dem Speichern ein Formular zeigen.
- **Person, Datum und Kanal kommen dabei automatisch aus der Nachricht** – niemand tippt etwas ab.
  Genau daran hängt das Löschrecht (siehe unten), deshalb wird die **Person nicht abgefragt**: sie
  ist die Autorin der Nachricht und steckt als ID in der `customId` des Modals, nicht in einem Feld.
- **Der Rechtsklick öffnet ein vorbefülltes Modal**, statt sofort zu speichern: Wortlaut kürzen,
  Kontext ergänzen (vorbelegt mit dem Kanalnamen), Datum korrigieren oder leeren. Dasselbe Modal
  bedient `/bash bearbeiten` – ein Formular, zwei Wege.
- **Vor einem `showModal` darf nicht deferred werden**, Discord lässt das Modal danach nicht mehr zu.
  Deshalb hat der Kontextmenü-Pfad kein `deferReply`, obwohl er Redis anfasst.
- Bewusst **kein manuelles Anlegen** (Zitate von außerhalb des Chats, z. B. aus Sprachkanälen). Wäre
  ein `/bash hinzufuegen` mit demselben Modal, aber ohne echte Person-ID – also mit einem Freitext-Namen,
  an dem das Löschrecht der zitierten Person nicht greifen kann. Erst bauen, wenn es wirklich fehlt.
- Eine Nachricht lässt sich nur **einmal** festhalten (`findeNachNachricht`); sonst sammeln sich bei
  einem beliebten Spruch mehrere Nummern mit demselben Inhalt an.

## Nummern

- Vergeben per `INCR` auf `BASH:NAECHSTE_NUMMER` (Hochzählen und Lesen in einem Schritt, damit zwei
  gleichzeitige Speicherungen nicht dieselbe Nummer bekommen).
- `/bash anzahl` nennt neben dem Bestand auch die **höchste vorhandene Nummer** – wegen der Lücken
  (siehe unten) wäre „42 Zitate" allein irreführend, wer daraus auf `/bash zitat 42` schließt, landet
  womöglich in einer Lücke. Gezählt wird der Bestand (`holeAlle`), nicht der Zähler.
- **Gelöschte Nummern werden nie neu vergeben** – der Zähler läuft dem Bestand davon. Grund: „Zitat 69"
  wird im Chat verlinkt und zitiert; würde die Nummer nachrücken, zeigte ein alter Verweis später
  still etwas anderes. `/bash zitat 69` erklärt eine freie Nummer deshalb ausdrücklich als Lücke.

## Rechte

| | bearbeiten | entfernen |
|---|---|---|
| Ersteller (wer es festgehalten hat) | ja | ja |
| Zitierte Person | **nein** | **ja** |
| Admin | ja | ja |

Die Asymmetrie ist Absicht: gegen den Willen der zitierten Person soll nichts in der Sammlung
stehen bleiben – ihr aber auch niemand nachträglich andere Worte in den Mund legen können, sie
selbst eingeschlossen. Geprüft wird in `darfBearbeiten`/`darfEntfernen` (exportiert + getestet).

## Anzeige

- `formatZitat` setzt den Wortlaut als **Blockzitat** (jede Zeile mit `> `), damit ein mehrzeiliger
  Wortwechsel als Zitat erkennbar bleibt; darunter Person (**Name als Text**, seit 2026-11-15 über `holeAnzeigenamen` in `zeigeZitat`;
  vorher `<@id>`, das ohne Ping-Freigabe oft als „Unbekannter Benutzer“ erschien), Kontext und Datum,
  jeweils nur wenn vorhanden. `formatZitat` bekommt den Namen übergeben und bleibt so rein. Emojifrei wie alle Bot-Antworten.
- **`allowedMentions: {parse: []}` ist hier Pflicht** – Zitattext ist per Definition Fremdtext, in dem
  ein `<@…>` oder `@everyone` stehen kann (siehe CLAUDE.md). Die Person wird genannt, aber nie gepingt.
- Die Eingabe ist auf **1500 Zeichen** begrenzt (`MAX_ZITAT_LAENGE`), damit ein Zitat samt Rahmen
  immer in eine Discord-Nachricht passt – begrenzt wird die Eingabe, nicht später die Anzeige.
- Gespeichert wird das Datum als ISO (`YYYY-MM-DD`, sortierbar), eingegeben deutsch (`TT.MM.JJJJ`).
  Beide Richtungen prüfen mit **Round-Trip-Check** (`parseDatum` im Handler für die deutsche Form,
  `parseIsoDatum` im Service für das `<input type="date">` auf `/config`) – ohne den würde ein
  31.02. still zum 03.03., und ein falsches Datum am Zitat ist schlimmer als gar keins.

## Übersicht auf `/config`

- Die Liste liegt auf der **eigenen Unterseite `/config/bash`** (Muster wie die Morgengruß-Emojis und
  `/config/logs`): sie wächst mit jedem Zitat und würde die Hauptseite sonst dominieren – die zeigt nur
  die Anzahl und verlinkt. Bewusst **kein `/bash liste` in Discord**: eine wachsende Liste bräuchte dort
  Blättern, und zum Redigieren gibt es keine brauchbaren Formulare.
- Je Zitat ein Formular (Wortlaut als `<textarea>`, weil Zitate mehrzeilig sein dürfen; Kontext als
  Text; Datum als natives `<input type="date">`, so kommt nur ISO an) plus Entfernen-Button mit
  `confirm()`. Beide Aktionen posten gegen `POST /config/bash`, unterschieden über `name="aktion"`.
  Der Entfernen-Button ist `formnovalidate`, sonst blockiert das `required`-Textfeld ihn.
- Jede Zeile verlinkt die **Originalnachricht** (`https://discord.com/channels/…`) – der einzige Weg,
  einen bearbeiteten Wortlaut gegen das Original zu prüfen.
- `holeBashZitate` löst Person und Ersteller zu **Anzeigenamen** auf (Fallback: die rohe ID, wenn die
  Person den Server verlassen hat) – eine Tabelle voller Zahlen wäre nicht prüfbar.
- `speichereBashZitat` prüft Wortlaut und Datum selbst und meldet `false`, statt etwas Kaputtes zu
  schreiben; der Router antwortet dann mit 400 statt „gespeichert" zu melden.

## Verkabelung

- **Kontextmenü-Befehle liegen NICHT in `commands/index.ts`**, sondern in `commands/kontextmenues.ts`:
  ihre Definition hat keine `options`, und die aus der Command-Registrierung **abgeleiteten**
  Hilfe-Tests (flach vs. Gruppe, siehe [Hilfe](hilfe.md)) würden darüber stolpern. Registriert werden
  beide Listen zusammen in **einem** `rest.put` (`deploy-commands.ts`) – der Aufruf ersetzt die
  komplette Guild-Registrierung, ein zweiter `put` würde den ersten wieder wegräumen.
- Verteilt wird in `interaction.handler.ts`: eigene Collection `client.kontextBefehle` für die
  Kontextmenüs, und `isModalSubmit()` → `bashHandler.handleModal`, der wie die Button-Handler sein
  `customId`-Prefix selbst prüft. **Kein Tipp** nach einem Kontextmenü-Aufruf (die Tipp-Zeile hängt
  sich an Slash-Antworten, und hier folgt meist ein Modal – dort geht kein `followUp`).
- Die `customId` trägt den Zustand (`bash-modal:neu:<personId>:<channelId>:<messageId>` bzw.
  `bash-modal:bearbeiten:<nummer>`), kein Redis-Zwischenspeicher – dieselbe zustandslose Philosophie
  wie bei den Button-`customId`s. Discords Grenze von 100 Zeichen ist damit gut eingehalten.
