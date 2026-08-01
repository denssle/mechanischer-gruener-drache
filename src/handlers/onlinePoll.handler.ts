import onlineService from '../services/online.service.js';
import beobachtenHandler from './beobachten.handler.js';
import drachenHandler from './drachen.handler.js';

// Gemeinsamer Abruf der Kriegerliste. Es gibt keine Push-API, also Polling - angestoßen vom EINEN
// 60-s-Timer in index.ts (kein zweiter Mechanismus), die Taktung macht diese Datei selbst.
//
// WARUM EIGENE DATEI: der Poll hatte zuerst nur einen Abnehmer (die Beobachtungsliste) und lebte
// deshalb in deren Handler. Mit der Drachentötungs-Gratulation kam ein zweiter dazu - und ein
// Abruf, an dem zwei Features hängen, gehört keinem von beiden. Läge er weiter bei `beobachten`,
// hinge die Drachenerkennung still davon ab, dass überhaupt jemand eine Beobachtungsliste führt
// (der Abruf steigt sonst vorher aus); nimmt der letzte Beobachter seinen Eintrag heraus, hörten
// die Gratulationen ohne erkennbaren Grund auf. Gleiches Muster wie `dm.service.ts`, das mit dem
// zweiten Nutzer aus dem Anstupser-Handler gewandert ist.
//
// Die Abhängigkeit läuft nur in EINE Richtung: dieser Poller kennt seine Abnehmer, die Abnehmer
// kennen ihn nicht - kein Zyklus.

// Wie oft list.php wirklich abgerufen wird. Bewusst nicht im Minutentakt: die Seite gehört nicht
// uns, ~288 Abrufe am Tag sind ein höflicher Kompromiss. Preis dafür: eine Beobachtungs-Meldung
// kommt bis zu 5 Minuten später, und sehr kurze Sitzungen können zwischen zwei Abrufen
// durchrutschen.
export const POLL_INTERVALL_MS = 5 * 60 * 1000;

class OnlinePollHandler {
    // Zeitpunkt des letzten Abrufs. Bewusst NUR im Speicher, kein Redis-Marker wie bei den
    // Tagesaufgaben: ein verpasster Poll wird nicht nachgeholt (der Online-Stand von vorhin ist
    // wertlos), und nach einem Neustart darf sofort wieder gepollt werden.
    #letzterPoll = 0;

    // Wird vom 60-s-Timer angestupst und entscheidet selbst, ob wirklich etwas zu tun ist.
    async poll(): Promise<void> {
        try {
            if (Date.now() - this.#letzterPoll < POLL_INTERVALL_MS) return;

            // Braucht überhaupt jemand die Daten? Will keiner sie, wird lotgd.de gar nicht erst
            // behelligt. Beide Abnehmer werden gefragt - es genügt, wenn EINER etwas davon hat.
            const [beobachtungenAktiv, drachenAktiv] = await Promise.all([
                beobachtenHandler.brauchtOnlineStand(),
                drachenHandler.brauchtOnlineStand(),
            ]);

            // Der Zeitstempel wandert auch dann weiter, wenn niemand die Daten braucht - sonst
            // liefe die Bedarfsabfrage jede Minute statt alle fünf.
            this.#letzterPoll = Date.now();
            if (!beobachtungenAktiv && !drachenAktiv) return;

            const data = await onlineService.getOnline();
            // Abruf/Markup kaputt: beide Abnehmer bekommen NICHTS statt einer leeren Liste. Für
            // die Beobachtungsliste wäre eine leere Liste fatal (danach gälte jeder Eingeloggte
            // als frisch online), für die Drachenprüfung schlicht sinnlos.
            if (!data) return;

            // Jeder Abnehmer fängt seine Fehler selbst ab; nacheinander, damit ein langsamer
            // DM-Versand nicht mit der Level-Prüfung um dieselbe Redis-Verbindung ringt.
            if (beobachtungenAktiv) await beobachtenHandler.verarbeiteOnlineStand(data.players);
            if (drachenAktiv) await drachenHandler.pruefeLevel(data.players);
        } catch (error) {
            console.error('Fehler beim Abrufen des Online-Stands:', error);
        }
    }
}

export default new OnlinePollHandler();
