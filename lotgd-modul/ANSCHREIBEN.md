# Anschreiben an die lotgd.de-Betreiber (Entwurf)

> Entwurf zum Anpassen und Verschicken (Mail/Forum/wie auch immer der Draht ist).
> Anhängen bzw. verlinken: `drachenbot.php`, `README.md`, Screenshots aus der Sandbox.

---

Hallo [Name],

ihr hattet uns ja grünes Licht gegeben, den Discord-Bot unserer Community an das Spiel
anzubinden – mit dem klaren Hinweis, dass ihr selbst keine Kapazität dafür habt. Wir haben
das ernst genommen und deshalb nicht um etwas gebeten, sondern **etwas Fertiges gebaut**:
ein kleines LotGD-Modul, das ihr nur noch anschauen (und hoffentlich einspielen) müsst.

**Was es macht:** Spieler können sich im Spiel – komplett freiwillig – ein Token erzeugen
(neuer Nav-Punkt im Dorf) und es beim Discord-Bot hinterlegen. Der Bot kann damit ihre
Charakterdaten **lesen** (Level, Ort, Gold usw. – die genaue Feldliste steht im README) und
im Discord anzeigen. Das Token ist jederzeit im Spiel widerrufbar; gespeichert wird nur ein
Hash, nie das Token selbst. Kein Passwort, keine Session, kein Schreiben, keine Datei
außerhalb von `modules/` – der anonyme API-Zweig nutzt denselben `allowanonymous`-Mechanismus
wie eure öffentlichen Module (`legalinfo`, `dataprotection`).

**Warum ein Modul:** Alle anderen Wege wären unsauber gewesen – Passwörter beim Bot zu
speichern kam für uns nicht in Frage, und Session-Cookies taugen nicht (Timeout, und der
Spieler stünde permanent in der Online-Liste). Ein vom Spiel ausgestelltes, widerrufbares
Read-Only-Token ist die einzige Variante, bei der die Kontrolle vollständig bei den Spielern
und bei euch bleibt.

**Stand:** Eine einzige Datei (gut 200 Zeilen, in einem Durchgang lesbar), entwickelt und
end-to-end getestet in einer lokalen Sandbox (LotGD 1.1.2 Dragonprime, PHP 5.6 – der Code ist
bewusst PHP-5-kompatibel). Screenshots vom Ablauf hängen an. Installation: Datei kopieren,
Modul aktivieren. Deinstallation entfernt alles rückstandsfrei.

**Unser Vorschlag:** Wenn ihr mögt, spielt es zuerst auf **dev.lotgd.de** ein – dort können
wir es gemeinsam gefahrlos am echten 1.2.0-Stand testen, bevor überhaupt über die Produktion
geredet wird. Und natürlich: Das README erklärt jede Design-Entscheidung, aber **ihr habt bei
allem das letzte Wort** – Feldliste kürzen, Texte ändern, Dinge rauswerfen: sagt einfach
Bescheid, wir bauen es um. Wenn ihr es ganz ablehnt, ist das auch okay – eure Instanz, eure
Entscheidung.

Viele Grüße
Dominik

---

> **Checkliste vorm Abschicken:**
> - [ ] Anrede/Name einsetzen
> - [ ] `drachenbot.php` + `README.md` anhängen oder GitHub-Link
>       (https://github.com/denssle/mechanischer-gruener-drache, Ordner `lotgd-modul/`)
> - [ ] Screenshots anhängen (Token-Seite, Token-Anzeige, JSON-Antwort)
> - [ ] Zeilenzahl ggf. aktualisieren, falls sich das Modul noch ändert
