import {ChatInputCommandInteraction, MessageFlags} from 'discord.js';
import beobachtenService, {MAX_NAMEN} from '../services/beobachten.service.js';
import onlineService, {OnlinePlayer} from '../services/online.service.js';
import characterService, {findInRoster, findLinkForName, passtAufKernNamen} from '../services/character.service.js';
import {sendeDm} from '../services/dm.service.js';

// Beobachtungsliste für LotGD-Charaktere (war README-Todo): wer will, hinterlegt Namen und
// bekommt eine DM, sobald einer davon im Spiel online geht.
//
// Zwei Design-Entscheidungen, beide vom Anstupser-Abo übernommen: die Liste gehört der
// EINZELNEN Person (kein serverweiter Aushang, keine Admin-Liste) und die Meldung kommt per
// DM. Wen jemand beobachtet, geht deshalb niemanden sonst etwas an - alle Antworten hier sind
// ephemer, und es gibt bewusst keinen Weg, fremde Listen einzusehen.
//
// Opt-in der Beobachteten (seit 2026-07-31, Community-Beschwerde): beobachten lässt sich NUR,
// wer den eigenen Charakter per /charakter verknuepfen hinterlegt und die Beobachtung per
// /charakter beobachtbar freigegeben hat. Wer nicht verknüpft ist (auch: gar nicht auf dem
// Server), ist damit automatisch geschützt - die Kriegerliste ist zwar öffentlich, aber eine
// automatisierte Meldung über Login-Zeiten ist etwas anderes als gelegentliches Nachsehen.
// Geprüft wird an ZWEI Stellen: beim Hinzufügen (klare Rückmeldung) und bei jedem Poll (fängt
// Bestandseinträge und später widerrufene Freigaben ab). Die Abfuhr beim Hinzufügen ist für
// "nicht verknüpft" und "nicht freigegeben" bewusst DIESELBE - sonst wäre sie ein Orakel dafür,
// wer den Bot nutzt.
//
// Es gibt keine Push-API, also Polling der ohnehin gescrapten Kriegerliste. Angestoßen vom
// EINEN 60-s-Timer in index.ts (kein zweiter Mechanismus) - die Taktung macht diese Datei
// selbst, siehe POLL_INTERVALL_MS.

// Wie oft list.php wirklich abgerufen wird. Bewusst nicht im Minutentakt: die Seite gehört
// nicht uns, ~288 Abrufe am Tag sind ein höflicher Kompromiss. Preis dafür: die Meldung kommt
// bis zu 5 Minuten später, und sehr kurze Sitzungen können zwischen zwei Abrufen durchrutschen.
export const POLL_INTERVALL_MS = 5 * 60 * 1000;

export const BEOBACHTEN_HILFE =
    `**Beobachtungs-Befehle**\n\n` +
    `**/beobachten hinzufuegen** – Einen Charakternamen auf deine Liste setzen\n` +
    `**/beobachten entfernen** – Einen Namen wieder herunternehmen\n` +
    `**/beobachten liste** – Zeigt, wen du beobachtest\n` +
    `**/beobachten hilfe** – Zeigt diese Übersicht\n\n` +
    `Geht jemand von deiner Liste im Spiel online, schicke ich dir eine DM. ` +
    `Gemeldet wird nur der Moment des Einloggens, nicht wiederholt, solange jemand drin bleibt – ` +
    `und höchstens einmal pro Stunde und Name.\n` +
    `Beobachten lässt sich nur, wer selbst zugestimmt hat: Die Person muss ihren Charakter mit ` +
    `/charakter verknuepfen hinterlegt und mit /charakter beobachtbar freigegeben haben.\n` +
    `Deine Liste sieht nur du, sie fasst höchstens ${MAX_NAMEN} Namen. ` +
    `Damit die DM ankommt, müssen „Direktnachrichten von Servermitgliedern" in deinen ` +
    `Discord-Einstellungen erlaubt sein – beim ersten Namen wird das direkt geprüft.`;

// Meldung an den Beobachter. Rein und getestet; der Ort steht in der Kriegerliste ohnehin dabei
// und beantwortet gleich mit, ob sich das Hinterherreisen lohnt.
export function formatMeldung(anzeigeName: string, ort: string): string {
    const wo = ort ? ` – ${ort}` : '';
    return `**${anzeigeName}** ist gerade im Wyrmland unterwegs${wo}.\n` +
        `_Von deiner Liste nehmen: /beobachten entfernen_`;
}

class BeobachtenHandler {
    // Zeitpunkt des letzten Abrufs. Bewusst NUR im Speicher, kein Redis-Marker wie bei den
    // Tagesaufgaben: ein verpasster Poll wird nicht nachgeholt (der Online-Stand von vorhin
    // ist wertlos), und nach einem Neustart darf sofort wieder gepollt werden.
    #letzterPoll = 0;

    async handleHinzufuegen(interaction: ChatInputCommandInteraction) {
        const eingabe = interaction.options.getString('name', true).trim();

        const liste = await beobachtenService.holeListe(interaction.user.id);
        if (liste.length >= MAX_NAMEN) {
            return interaction.reply({
                content: `Deine Liste ist voll (${MAX_NAMEN} Namen). Nimm erst jemanden herunter: ` +
                    `\`/beobachten entfernen\`.`,
                flags: MessageFlags.Ephemeral,
            });
        }
        if (liste.some(name => name.toLowerCase() === eingabe.toLowerCase())) {
            return interaction.reply({
                content: `**${eingabe}** steht schon auf deiner Liste.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({flags: MessageFlags.Ephemeral});

        // Gegen das Roster prüfen (wie /charakter verknuepfen): ein Tippfehler würde sonst nie
        // auffallen - die Meldung bliebe einfach für immer aus.
        const roster = await characterService.getRoster();
        if (roster === null) {
            return interaction.editReply(
                'Ich komme gerade nicht an die Kriegerliste, um den Namen zu prüfen. Versuch es später nochmal.'
            );
        }
        const treffer = findInRoster(roster, eingabe);
        if (!treffer) {
            return interaction.editReply(
                `**${eingabe}** finde ich nicht in der Kriegerliste. Schreib den Namen ohne Titel, ` +
                `also z.B. „Acaine" statt „Centurio Acaine".`
            );
        }

        // Opt-in der beobachteten Person (siehe Kopfkommentar): ohne verknüpften Charakter MIT
        // Freigabe wird nichts gespeichert. Bewusst EINE Meldung für beide Fälle.
        const link = findLinkForName(await characterService.getAllLinks(), treffer.name);
        if (!link || !(await beobachtenService.hatFreigabe(link.discordUserId))) {
            return interaction.editReply(
                `**${treffer.name}** hat die Beobachtung nicht freigegeben. Auf eine Liste setzen ` +
                `lässt sich nur, wer den eigenen Charakter mit \`/charakter verknuepfen\` hinterlegt ` +
                `und mit \`/charakter beobachtbar\` zugestimmt hat.`
            );
        }

        // Erster Name: erst eine Test-DM, dann speichern. Kommt sie nicht an, wird gar nicht erst
        // etwas eingetragen - sonst wartet jemand wochenlang still auf eine Meldung (Anstupser-Muster).
        if (liste.length === 0) {
            const zugestellt = await sendeDm(
                interaction.user.id,
                `Ab jetzt sage ich dir Bescheid, wenn **${treffer.name}** im Wyrmland auftaucht.`,
                'Beobachtung'
            );
            if (!zugestellt) {
                return interaction.editReply(
                    'Ich kann dir gerade keine DM schicken – vermutlich sind deine Direktnachrichten ' +
                    'für Servermitglieder aus. Stell das in den Discord-Einstellungen um und versuch es ' +
                    'nochmal; auf deine Liste gesetzt habe ich noch niemanden.'
                );
            }
        }

        await beobachtenService.fuegeHinzu(interaction.user.id, eingabe);
        return interaction.editReply(
            `**${treffer.name}** steht jetzt auf deiner Liste (${liste.length + 1}/${MAX_NAMEN}). ` +
            `Ich melde mich per DM, sobald der Charakter online geht.`
        );
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        const eingabe = interaction.options.getString('name', true).trim();

        const liste = await beobachtenService.holeListe(interaction.user.id);
        // Groß-/Kleinschreibung soll beim Herunternehmen nicht im Weg stehen - der gespeicherte
        // Name muss aber exakt getroffen werden, sonst löscht das Set nichts.
        const gespeichert = liste.find(name => name.toLowerCase() === eingabe.toLowerCase());
        if (!gespeichert) {
            return interaction.reply({
                content: `**${eingabe}** steht nicht auf deiner Liste.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        await beobachtenService.entferne(interaction.user.id, gespeichert);
        return interaction.reply({
            content: `**${gespeichert}** ist von deiner Liste herunter.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleListe(interaction: ChatInputCommandInteraction) {
        const liste = await beobachtenService.holeListe(interaction.user.id);
        if (liste.length === 0) {
            return interaction.reply({
                content: 'Du beobachtest gerade niemanden. Mit `/beobachten hinzufuegen` geht es los.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const namen = [...liste].sort((a, b) => a.localeCompare(b, 'de'));
        return interaction.reply({
            content: `**Du beobachtest (${namen.length}/${MAX_NAMEN}):**\n` +
                namen.map(name => `• ${name}`).join('\n'),
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(BEOBACHTEN_HILFE);
    }

    // Wird vom 60-s-Timer angestupst und entscheidet selbst, ob wirklich etwas zu tun ist.
    // Fehlertolerant wie die anderen Timer-Aufgaben.
    async pruefeBeobachtungen(): Promise<void> {
        try {
            if (Date.now() - this.#letzterPoll < POLL_INTERVALL_MS) return;

            // Beobachtet niemand etwas, wird lotgd.de gar nicht erst behelligt.
            const beobachter = await beobachtenService.holeBeobachter();
            this.#letzterPoll = Date.now();
            if (beobachter.length === 0) return;

            const data = await onlineService.getOnline();
            // Abruf/Markup kaputt: Übergangs-State NICHT anfassen. Würde er hier geleert, gälte
            // beim nächsten Durchlauf jeder Eingeloggte als frisch online.
            if (!data) return;

            const treffer = await this.sammleTreffer(beobachter, data.players);

            const zuletzt = new Set(await beobachtenService.holeZuletztOnline());
            // Den neuen Stand VOR dem Versand festhalten (Anstupser-Muster): viele DMs dauern,
            // und ein zweiter Durchlauf würde sonst dieselbe Runde erneut melden.
            await beobachtenService.setzeZuletztOnline([...treffer.keys()]);

            for (const [schluessel, eintrag] of treffer) {
                if (zuletzt.has(schluessel)) continue; // war schon beim letzten Mal da
                for (const userId of eintrag.beobachter) {
                    if (await beobachtenService.istGesperrt(userId, schluessel)) continue;
                    const zugestellt = await sendeDm(
                        userId, formatMeldung(eintrag.anzeigeName, eintrag.ort), 'Beobachtung'
                    );
                    if (zugestellt) await beobachtenService.sperre(userId, schluessel);
                }
            }
        } catch (error) {
            console.error('Fehler beim Prüfen der Beobachtungslisten:', error);
        }
    }

    // Welche beobachteten Namen sind gerade eingeloggt - und wer wartet jeweils darauf?
    // Verglichen wird über passtAufKernNamen, weil die Kriegerliste den level-/drachenabhängigen
    // Titel voranstellt ("Centurio Acaine"), der gespeicherte Name aber der Kern ist.
    // Die Freigabe wird HIER erneut geprüft, nicht nur beim Hinzufügen: das fängt Einträge von
    // vor dem Opt-in ab und lässt einen Widerruf sofort wirken - Bestandslisten bleiben dann
    // einfach stumm liegen.
    private async sammleTreffer(beobachter: string[], spieler: OnlinePlayer[]) {
        const treffer = new Map<string, { anzeigeName: string; ort: string; beobachter: string[] }>();
        const links = await characterService.getAllLinks();
        const freigaben = new Set(await beobachtenService.holeFreigaben());

        for (const userId of beobachter) {
            for (const name of await beobachtenService.holeListe(userId)) {
                const player = spieler.find(p => passtAufKernNamen(p.name, name));
                if (!player) continue;

                const link = findLinkForName(links, player.name);
                if (!link || !freigaben.has(link.discordUserId)) continue;

                const schluessel = name.toLowerCase();
                const eintrag = treffer.get(schluessel)
                    ?? {anzeigeName: player.name, ort: player.ort, beobachter: []};
                eintrag.beobachter.push(userId);
                treffer.set(schluessel, eintrag);
            }
        }

        return treffer;
    }
}

export default new BeobachtenHandler();
