import {escapeMarkdown, Guild} from 'discord.js';
import userService from './user.service.js';
import {beschreibeFehler} from './fehler.service.js';

// Anzeigenamen für Listen, die Leute NENNEN, aber nicht anpingen sollen (Ruhmeshalle, Geburtstage,
// /online, …). Früher standen dort `<@id>`-Erwähnungen mit allowedMentions {parse: []}. Gemessen
// 2026-11-15: ohne Freigabe lässt Discord das mentions-Feld der Nachricht leer, die App muss die
// Erwähnung dann selbst auflösen und zeigt bei allen, die sie gerade nicht kennt, "Unbekannter
// Benutzer" - davon bekommt der Bot nichts mit. Eine Freigabe würde in einer NEUEN Nachricht
// pingen. Deshalb schreibt der Bot die Namen selbst hin; scheitert das, steht es im Log.
//
// Reihenfolge: Server-Mitglied (Cache, dann ein gesammelter Abruf) > gespeicherter Name aus
// user.service (auch für Leute, die den Server verlassen haben) > UNBEKANNTER_NAME mit Logzeile.

export const UNBEKANNTER_NAME = 'unbekannt';

// Discord nimmt beim Mitglieder-Abruf höchstens 100 IDs auf einmal.
const ABRUF_GROESSE = 100;

// Jede nicht auflösbare ID nur einmal pro Prozess und Kontext melden - sonst schreibt jede
// Abfrage derselben Liste dieselbe Zeile ins Log.
const schonGemeldet = new Set<string>();

export function vergissMeldungen(): void {
    schonGemeldet.clear();
}

// Liefert für JEDE übergebene ID einen Namen (Markdown-entschärft, also direkt in fett/kursiv
// gesetzten Text einsetzbar). `kontext` erscheint in den Logzeilen, z.B. "Ruhmeshalle".
// Der Aufrufer setzt trotzdem allowedMentions {parse: []}: Namen sind Freitext, den andere wählen.
export async function holeAnzeigenamen(guild: Guild | null | undefined, userIds: string[], kontext: string)
    : Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    const namen = new Map<string, string>();

    if (guild) {
        for (const id of ids) {
            const member = guild.members.cache.get(id);
            if (member) namen.set(id, member.displayName);
        }

        const fehlend = ids.filter(id => !namen.has(id));
        for (let start = 0; start < fehlend.length; start += ABRUF_GROESSE) {
            const teil = fehlend.slice(start, start + ABRUF_GROESSE);
            try {
                const geholt = await guild.members.fetch({user: teil});
                for (const [id, member] of geholt) namen.set(id, member.displayName);
            } catch (error) {
                console.warn(`${kontext}: ${teil.length} Mitglieder nicht abrufbar, nehme gespeicherte Namen: `
                    + beschreibeFehler(error));
            }
        }
    }

    for (const id of ids.filter(id => !namen.has(id))) {
        let grund = guild ? 'nicht (mehr) auf dem Server und kein gespeicherter Name' : 'kein Server und kein gespeicherter Name';
        try {
            const gespeichert = await userService.getUser(id);
            if (gespeichert?.displayName) {
                namen.set(id, gespeichert.displayName);
                continue;
            }
        } catch (error) {
            grund = `gespeicherter Name nicht lesbar: ${beschreibeFehler(error)}`;
        }

        namen.set(id, UNBEKANNTER_NAME);
        const schluessel = `${kontext}:${id}`;
        if (!schonGemeldet.has(schluessel)) {
            schonGemeldet.add(schluessel);
            console.warn(`${kontext}: Name für ${id} nicht ermittelbar (${grund}) - zeige „${UNBEKANNTER_NAME}“.`);
        }
    }

    return new Map(ids.map(id => [id, escapeMarkdown(namen.get(id) ?? UNBEKANNTER_NAME)]));
}
