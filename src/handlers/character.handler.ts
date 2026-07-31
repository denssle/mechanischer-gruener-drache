import {ChatInputCommandInteraction, EmbedBuilder, MessageFlags} from 'discord.js';
import characterService, {CharacterEntry, findInRoster, findLinkForName, passtAufKernNamen} from '../services/character.service.js';
import onlineService, {OnlinePlayer} from '../services/online.service.js';
import beobachtenService from '../services/beobachten.service.js';

// Lore-Flavor für tote Charaktere: statt nur "tot" eine LotGD-stimmige Zeile. Wiederauferstehung
// geschieht beim Anbruch des neuen Tages oder über Gefallen beim Totengott Ramius - beides steckt hier drin.
export const TOTEN_FLAVORS = [
    'wartet im Land der Schatten auf den Anbruch des neuen Tages',
    'ruht im Land der Schatten und sammelt Gefallen bei Ramius, dem Totengott',
    'harrt im Reich des Todes der Wiederauferstehung',
    'ist gefallen und wartet auf den neuen Tag, der die Toten zurückholt',
];

export function randomTotenFlavor(): string {
    return TOTEN_FLAVORS[Math.floor(Math.random() * TOTEN_FLAVORS.length)];
}

export const CHARAKTER_HELP =
    `**Charakter-Befehle**\n\n` +
    `\`/charakter verknuepfen name:<Name>\` – deinen LotGD-Charakter hinterlegen (nur der öffentliche Name).\n` +
    `\`/charakter anzeigen [name:<Name>]\` – Charakter-Karte anzeigen; ohne Name deinen verknüpften. ` +
    `Sagt auch, ob die Person gerade im Spiel ist und wo, und ob sie die Beobachtung ` +
    `(\`/beobachten\`) freigegeben hat – die Antwort siehst nur du.\n` +
    `\`/charakter entfernen\` – deine Verknüpfung löschen.\n` +
    `\`/charakter beobachtbar schalter:<an/aus>\` – erlauben oder verbieten, dass andere sich per ` +
    `\`/beobachten\` melden lassen, wenn dein Charakter online geht. Standard ist aus.\n` +
    `\`/charakter hilfe\` – zeigt diese Übersicht.\n\n` +
    `Alle Daten stammen aus der öffentlichen Kriegerliste von lotgd.de – kein Login, keine Passwörter.`;

// Aktivitätsstand aus den beiden Listen von list.php. "online" trägt den Ort mit, weil er dort
// frischer ist als im (bis zu 10 min gecachten) Roster.
export type Aktivitaet = { stufe: 'online'; ort: string } | { stufe: 'kuerzlich' };

// Wie aktiv ist der Charakter gerade? null = keine Aussage möglich - entweder ist der Abruf
// gescheitert (online === null) oder er steht in keiner der beiden Listen. In beiden Fällen fällt
// die Karte auf "zuletzt gesehen" aus dem Roster zurück, statt etwas zu behaupten.
// Verglichen wird über den Kern-Namen, weil die Listen den Titel-Präfix genauso tragen wie das Roster.
export function bestimmeAktivitaet(
    kernName: string,
    online: {players: OnlinePlayer[]; recent: string[]} | null,
): Aktivitaet | null {
    if (!online) return null;

    const eingeloggt = online.players.find(player => passtAufKernNamen(player.name, kernName));
    if (eingeloggt) return {stufe: 'online', ort: eingeloggt.ort};

    if (online.recent.some(name => passtAufKernNamen(name, kernName))) return {stufe: 'kuerzlich'};

    return null;
}

// Die eine Zeile, um die es beim Ausbau ging: lohnt es sich, ins Spiel zu gehen? Ohne
// Aktivitätsstand die tagesgenaue Roster-Angabe ("Heute", "5 Tage") - feiner gibt die Seite es nicht her.
export function formatAktivitaet(aktivitaet: Aktivitaet | null, zuletztDa: string): string {
    if (aktivitaet?.stufe === 'online') return 'gerade im Spiel';
    if (aktivitaet?.stufe === 'kuerzlich') return 'in den letzten 30 Minuten aktiv';
    return `zuletzt gesehen: ${zuletztDa}`;
}

// Darf dieser Charakter beobachtet werden (Opt-in via /charakter beobachtbar)? "Nein" deckt
// bewusst BEIDE Fälle ab (nicht verknüpft / Freigabe nicht erteilt) - dieselbe Orakel-Vermeidung
// wie bei der Abfuhr in /beobachten hinzufuegen. null = gerade nicht feststellbar (Redis-Problem);
// die Zeile entfällt dann ersatzlos, der Stand ist ein Bonus und darf die Karte nie kosten.
async function ermittleBeobachtbar(anzeigeName: string): Promise<boolean | null> {
    try {
        const link = findLinkForName(await characterService.getAllLinks(), anzeigeName);
        return link !== null && await beobachtenService.hatFreigabe(link.discordUserId);
    } catch (error) {
        console.warn('Konnte den Beobachtbar-Stand nicht ermitteln:', error);
        return null;
    }
}

function buildCard(
    entry: CharacterEntry,
    aktivitaet: Aktivitaet | null = null,
    beobachtbar: boolean | null = null,
): EmbedBuilder {
    // Beim Eingeloggten den Ort aus der Online-Tabelle nehmen; das Roster ist bis zu 10 min alt.
    const ort = aktivitaet?.stufe === 'online' ? aktivitaet.ort : entry.ort;
    const status = formatAktivitaet(aktivitaet, entry.zuletztDa);

    const lines = [
        `Stufe ${entry.level} · ${entry.rasse} · ${entry.geschlecht}`,
        `Ort: ${ort}`,
    ];
    if (entry.gilde) {
        lines.push(`Gilde: ${entry.gilde}`);
    }
    if (entry.lebt) {
        lines.push(`lebendig · ${status}`);
    } else {
        lines.push(`tot – ${randomTotenFlavor()}`);
        lines.push(status);
    }
    if (beobachtbar !== null) {
        lines.push(beobachtbar ? 'Beobachtung: freigegeben' : 'Beobachtung: nicht freigegeben');
    }

    return new EmbedBuilder()
        .setColor(entry.lebt ? 0x2ecc71 : 0x992d22)
        .setTitle(entry.name)
        .setDescription(lines.join('\n'))
        .setFooter({text: 'Daten von lotgd.de (öffentliche Kriegerliste)'});
}

class CharacterHandler {
    async handleVerknuepfen(interaction: ChatInputCommandInteraction) {
        const name = interaction.options.getString('name', true).trim();

        await interaction.deferReply();

        const existing = await characterService.getLinkedName(interaction.user.id);
        if (existing) {
            return interaction.editReply(
                `Du hast bereits **${existing}** verknüpft. Nutze \`/charakter entfernen\`, um das zu ändern.`
            );
        }

        const roster = await characterService.getRoster();
        if (!roster) {
            return interaction.editReply('Konnte die Kriegerliste gerade nicht abrufen. Versuch es später nochmal.');
        }

        const entry = findInRoster(roster, name);
        if (!entry) {
            return interaction.editReply(
                `Charakter **${name}** nicht in der Kriegerliste gefunden. Achte auf die exakte Schreibweise (ohne Titel).`
            );
        }

        // Den eingegebenen Kern-Namen speichern (der Titel-Präfix im Roster ändert sich).
        await characterService.linkCharacter(interaction.user.id, name);

        // Frisch verknüpft ist die Beobachtungs-Freigabe immer aus (entfernen räumt sie mit ab) -
        // kein Abruf nötig, dafür der Hinweis, wie man sie einschaltet.
        return interaction.editReply({
            content: `Charakter **${entry.name}** verknüpft! Beobachtung ist standardmäßig aus – ` +
                `freigeben kannst du sie mit \`/charakter beobachtbar schalter:an\`.`,
            embeds: [buildCard(entry, null, false)],
        });
    }

    async handleAnzeigen(interaction: ChatInputCommandInteraction) {
        const provided = interaction.options.getString('name', false)?.trim();

        // Ephemer: die Karte beantwortet "lohnt es sich gerade, ins Spiel zu gehen?" - eine private
        // Frage, die den Kanal nichts angeht (Noise-Linie des Projekts).
        await interaction.deferReply({flags: MessageFlags.Ephemeral});

        const name = provided ?? await characterService.getLinkedName(interaction.user.id);
        if (!name) {
            return interaction.editReply(
                'Du hast keinen Charakter verknüpft. Nutze `/charakter verknuepfen name:<Name>` ' +
                'oder gib direkt einen Namen an: `/charakter anzeigen name:<Name>`.'
            );
        }

        // Zwei unabhängige Abrufe (Roster + Online-Stand) parallel. getOnline() fängt selbst alles
        // ab und liefert null - der Aktivitätsstand ist ein Bonus, die Karte darf daran nicht scheitern.
        const [roster, online] = await Promise.all([characterService.getRoster(), onlineService.getOnline()]);
        if (!roster) {
            return interaction.editReply('Konnte die Kriegerliste gerade nicht abrufen. Versuch es später nochmal.');
        }

        const entry = findInRoster(roster, name);
        if (!entry) {
            return interaction.editReply(
                `Charakter **${name}** nicht in der Kriegerliste gefunden. Achte auf die exakte Schreibweise (ohne Titel).`
            );
        }

        return interaction.editReply({
            embeds: [buildCard(entry, bestimmeAktivitaet(name, online), await ermittleBeobachtbar(entry.name))],
        });
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        const removed = await characterService.unlinkCharacter(interaction.user.id);
        if (!removed) {
            return interaction.reply('Du hast keinen Charakter verknüpft.');
        }

        // Die Beobachtungs-Freigabe hängt an der Verknüpfung und fällt mit ihr - sonst würde
        // eine spätere Neu-Verknüpfung (womöglich ein anderer Charakter) die alte Zustimmung
        // stillschweigend erben.
        await beobachtenService.entferneFreigabe(interaction.user.id);

        return interaction.reply('Deine Charakter-Verknüpfung wurde entfernt.');
    }

    // Opt-in für die Beobachtungsliste (/beobachten): nur wer hier zustimmt, kann von anderen
    // beobachtet werden. Setzt eine Verknüpfung voraus - die Freigabe gilt für den eigenen,
    // validierten Charakter, nicht für beliebige Namen. Ephemer wie /charakter anzeigen
    // (eine persönliche Einstellung geht den Kanal nichts an).
    async handleBeobachtbar(interaction: ChatInputCommandInteraction) {
        const schalter = interaction.options.getString('schalter', true);

        const name = await characterService.getLinkedName(interaction.user.id);
        if (!name) {
            return interaction.reply({
                content: 'Du hast keinen Charakter verknüpft. Nutze zuerst `/charakter verknuepfen name:<Name>` – ' +
                    'die Freigabe gilt für deinen verknüpften Charakter.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (schalter === 'an') {
            await beobachtenService.setzeFreigabe(interaction.user.id);
            return interaction.reply({
                content: `Andere können sich jetzt per \`/beobachten\` melden lassen, wenn **${name}** ` +
                    `online geht. Mit \`/charakter beobachtbar schalter:aus\` widerrufst du das jederzeit.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        await beobachtenService.entferneFreigabe(interaction.user.id);
        return interaction.reply({
            content: `Beobachtung ist aus – niemand bekommt mehr eine Meldung, wenn **${name}** online geht.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(CHARAKTER_HELP);
    }
}

export default new CharacterHandler();
