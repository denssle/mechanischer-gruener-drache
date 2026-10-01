# Camp-Feature (`/camp`)

Das Camp bildet den Fortschritt der zweiten Staffel der Sport-Challenge ab. Kilometer und Aktivitätsminuten aus dem bestehenden Sport-System werden ab Staffelstart in Camp-Ressourcen umgerechnet.

## Ressourcen

- 10 km = 1 Baumaterial (BM)
- 10 Aktivitätsminuten = 1 Vorrat

Die Ressourcen werden nicht separat gespeichert. Sie werden bei Bedarf aus den Sporteinträgen seit dem Camp-Start berechnet.

Dadurch bleiben Korrekturen an Sporteinträgen automatisch auch im Camp korrekt.

Verfügbare Ressourcen ergeben sich aus:

`gesammelt - Kosten bereits abgeschlossener Stufen`

Für die Berechnung bleiben die exakten Werte erhalten. Nur in der Discord-Anzeige wird auf eine Nachkommastelle gerundet.

Sinken die gesammelten Ressourcen nach einer Korrektur oder Löschung unter die bereits verbrauchte Menge, bleiben abgeschlossene Camp-Stufen bestehen. Die verfügbaren Ressourcen werden in der Anzeige mindestens als 0 dargestellt.

## Staffelstart

Das Camp startet nicht automatisch mit einem Bot-Neustart.

`/camp starten` ist ein Admin-Befehl und speichert einmalig den Startzeitpunkt unter `CAMP:START_DATE`.

Ein vorhandener Startzeitpunkt wird nicht überschrieben.

Erst Sporteinträge ab diesem Zeitpunkt zählen für die Camp-Ressourcen.

## Camp-Stufen

Die Stufen stehen als reine Daten in `src/data/camp.ts`.

`CAMP:CURRENT_LEVEL` speichert die Anzahl insgesamt abgeschlossener Stufen bzw. die Position in `CAMP_STUFEN`.

Dieser Wert ist bewusst unabhängig von `stufe`, da die Stufennummer innerhalb einer neuen Phase wieder bei 1 beginnen kann.

Aktuell definiert:
- Phase 0 – Verlassenes Lager ist der Ausgangszustand des Camps. Sie wird nicht freigeschaltet und hat keine Ressourcenkosten. Erst die Stufen ab Phase 1 liegen in `CAMP_STUFEN` und zählen für `CAMP:CURRENT_LEVEL`.
- Phase 1, Stufe 1 – Bewohnbares Lager: 15 BM / 80 Vorräte
- Phase 1, Stufe 2 – Feuerstelle & Vorratsplatz: 20 BM / 85 Vorräte

Weitere Phasen und Stufen können durch zusätzliche Einträge in `CAMP_STUFEN` ergänzt werden.

Reichen die verfügbaren Ressourcen für mehrere Stufen, können mehrere Stufen nacheinander erreicht werden.

## Fortschrittsprüfung

Nach summenändernden Sport-Aktionen wird geprüft, ob eine neue Camp-Stufe erreicht wurde.

Ein Fehler bei der Camp-Prüfung darf einen bereits erfolgreich gespeicherten oder bearbeiteten Sporteintrag nicht nachträglich fehlschlagen lassen.

## Ankündigungen

Eine Camp-Stufe gilt erst nach erfolgreicher Discord-Ankündigung als abgeschlossen.

Ablauf:

1. Der Camp-Service ermittelt erreichbare Stufen.
2. Der Handler kündigt jede Stufe einzeln an.
3. Erst nach erfolgreichem Versand wird `CAMP:CURRENT_LEVEL` erhöht.

Schlägt eine Ankündigung fehl, wird die betreffende Stufe nicht gespeichert und beim nächsten Camp-Check erneut versucht.

Ist kein Ankündigungskanal konfiguriert oder abrufbar, bleibt die Stufe ebenfalls ausstehend.

## Befehle

- `/camp ressourcen` – verfügbare und insgesamt gesammelte Ressourcen sowie die nächste Stufe
- `/camp starten` – startet die Camp-Ressourcensammlung, nur für Administratoren
- `/camp hilfe` – Übersicht der Camp-Befehle