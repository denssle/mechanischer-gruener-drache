import {
    ActionRowBuilder,
    ChatInputCommandInteraction,
    MessageContextMenuCommandInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import bashService, {BashZitat} from '../services/bash.service.js';
import {holeAnzeigenamen, UNBEKANNTER_NAME} from '../services/anzeigename.service.js';

// Zitatsammlung (Vorbild: die !quote-Funktion in Twitch-Chats). Erfasst wird per RECHTSKLICK auf
// eine Nachricht (Apps → "Als Bash-Zitat speichern"), nicht per Slash-Befehl: ein Slash-Command
// bekommt von Discord keinerlei Bezug zu einer Nachricht, "auf eine Nachricht antworten und dann
// /bash hinzufuegen" ist also technisch nicht abbildbar. Über den Rechtsklick sind Person, Datum
// und Kanal ohnehin bekannt - man tippt nichts ab und vertippt sich nicht.
//
// Der Rechtsklick öffnet ein vorbefülltes MODAL, statt sofort zu speichern: so lässt sich vor dem
// Festhalten noch der Wortlaut kürzen oder der Kontext ergänzen. Dasselbe Modal dient dem späteren
// /bash bearbeiten - ein Formular, zwei Wege.
//
// Zum Zitieren selbst gilt die allowedMentions-Regel besonders streng: Zitattext ist per Definition
// Fremdtext, in dem ein <@…> oder @everyone stehen kann.

// customId-Aufbau (Discord erlaubt 100 Zeichen): Prefix + Modus + IDs. Kein Redis-Zwischenspeicher
// nötig - dieselbe zustandslose Philosophie wie bei den Button-customIds.
export const MODAL_PREFIX = 'bash-modal';
const FELD_TEXT = 'text';
const FELD_KONTEXT = 'kontext';
const FELD_DATUM = 'datum';

// Ein gespeichertes Zitat muss als EINE Discord-Nachricht anzeigbar bleiben (Limit 2000 Zeichen),
// deshalb wird schon die Eingabe begrenzt statt später die Anzeige abgeschnitten.
export const MAX_ZITAT_LAENGE = 1500;

export function formatDatum(iso: string | null): string | null {
    if (!iso) {
        return null;
    }
    const [jahr, monat, tag] = iso.split('-');
    return jahr && monat && tag ? `${tag}.${monat}.${jahr}` : null;
}

// Eingabe im Formular ist die deutsche Schreibweise; leer heißt "unbekannt, bewusst weggelassen".
// Round-Trip-Check wie bei parseIsoDateTime, damit ein 31.02. nicht still zum 03.03. normalisiert
// wird - ein falsches Datum am Zitat wäre schlimmer als gar keins.
export function parseDatum(eingabe: string): {ok: true; wert: string | null} | {ok: false} {
    const roh = eingabe.trim();
    if (!roh) {
        return {ok: true, wert: null};
    }
    const treffer = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(roh);
    if (!treffer) {
        return {ok: false};
    }
    const [, tagRoh, monatRoh, jahrRoh] = treffer;
    const tag = Number(tagRoh);
    const monat = Number(monatRoh);
    const jahr = Number(jahrRoh);
    const datum = new Date(Date.UTC(jahr, monat - 1, tag));
    if (datum.getUTCFullYear() !== jahr || datum.getUTCMonth() !== monat - 1 || datum.getUTCDate() !== tag) {
        return {ok: false};
    }
    return {ok: true, wert: `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`};
}

// Anzeigeform. Der Zitattext steht als Blockzitat (jede Zeile mit "> "), damit ein mehrzeiliger
// Wortwechsel als Zitat erkennbar bleibt und nicht mit dem Bot-Text verschwimmt. Die zitierte
// Person steht mit Namen da, nicht als Erwähnung (siehe anzeigename.service) - `personName`
// kommt deshalb vom Aufrufer, die Funktion selbst bleibt rein.
export function formatZitat(zitat: BashZitat, personName: string): string {
    const zitiert = zitat.text.split('\n').map(zeile => `> ${zeile}`).join('\n');
    const angaben = [personName, zitat.kontext, formatDatum(zitat.datum)]
        .filter((wert): wert is string => Boolean(wert));
    return `**Zitat #${zitat.nummer}**\n${zitiert}\n– ${angaben.join(', ')}`;
}

// Admins dürfen alles; sonst zählt, wer das Zitat angelegt hat.
function istAdmin(interaction: ChatInputCommandInteraction): boolean {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

export function darfBearbeiten(zitat: BashZitat, interaction: ChatInputCommandInteraction): boolean {
    return istAdmin(interaction) || zitat.erstellerId === interaction.user.id;
}

// Zusätzlich zum Bearbeiten-Recht: wer zitiert wurde, darf sein Zitat löschen - auch wenn jemand
// anderes es angelegt hat. Bewusste Entscheidung: gegen den Willen der zitierten Person soll nichts
// in der Sammlung stehen bleiben. Ändern darf sie es nicht (das wäre Worte-in-den-Mund-legen).
export function darfEntfernen(zitat: BashZitat, interaction: ChatInputCommandInteraction): boolean {
    return darfBearbeiten(zitat, interaction) || zitat.personId === interaction.user.id;
}

// setValue nur bei tatsächlich vorhandenem Wert: ein leeres value ist für Discord kein "leeres
// Feld", sondern ein Wert der Länge 0 - die API lehnt das ab, und das Modal ginge gar nicht auf.
function setzeWert(feld: TextInputBuilder, wert: string): TextInputBuilder {
    return wert ? feld.setValue(wert) : feld;
}

function baueModal(customId: string, titel: string, werte: {text: string; kontext: string; datum: string}): ModalBuilder {
    const textFeld = new TextInputBuilder()
        .setCustomId(FELD_TEXT)
        .setLabel('Zitat')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(MAX_ZITAT_LAENGE);
    setzeWert(textFeld, werte.text);
    const kontextFeld = new TextInputBuilder()
        .setCustomId(FELD_KONTEXT)
        .setLabel('Ort/Kontext (kann leer bleiben)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
    setzeWert(kontextFeld, werte.kontext);
    const datumFeld = new TextInputBuilder()
        .setCustomId(FELD_DATUM)
        .setLabel('Datum TT.MM.JJJJ (kann leer bleiben)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10);
    setzeWert(datumFeld, werte.datum);
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(titel)
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(textFeld),
            new ActionRowBuilder<TextInputBuilder>().addComponents(kontextFeld),
            new ActionRowBuilder<TextInputBuilder>().addComponents(datumFeld),
        );
}

class BashHandler {
    // Öffentliche Antwort mit einem Zitat. allowedMentions bleibt leer: Zitattext ist fremder Text.
    async zeigeZitat(interaction: ChatInputCommandInteraction | ModalSubmitInteraction, zitat: BashZitat) {
        const namen = await holeAnzeigenamen(interaction.guild, [zitat.personId], '/bash');
        return interaction.reply({
            content: formatZitat(zitat, namen.get(zitat.personId) ?? UNBEKANNTER_NAME),
            allowedMentions: {parse: []},
        });
    }

    // Rechtsklick auf eine Nachricht → vorbefülltes Modal. Vor einem showModal darf NICHT deferred
    // werden (Discord lässt das Modal dann nicht mehr zu), deshalb keine deferReply hier.
    async handleNachrichtSpeichern(interaction: MessageContextMenuCommandInteraction) {
        const nachricht = interaction.targetMessage;
        const text = nachricht.content?.trim() ?? '';

        if (!text) {
            return interaction.reply({
                content: 'Diese Nachricht hat keinen Text, den ich zitieren könnte (Bilder und Anhänge kann ich nicht festhalten).',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Doppelt-Speichern-Bremse: sonst sammeln sich bei einem beliebten Spruch mehrere Nummern
        // mit demselben Inhalt an, und niemand weiß, welche die "richtige" ist.
        const schonDa = await bashService.findeNachNachricht(nachricht.id);
        if (schonDa) {
            return interaction.reply({
                content: `Diese Nachricht steht schon als **Zitat #${schonDa.nummer}** in der Sammlung.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const kanalName = 'name' in nachricht.channel && typeof nachricht.channel.name === 'string'
            ? `#${nachricht.channel.name}`
            : '';
        const datum = new Date(nachricht.createdTimestamp);
        const vorbelegung = {
            text: text.slice(0, MAX_ZITAT_LAENGE),
            kontext: kanalName,
            datum: `${String(datum.getDate()).padStart(2, '0')}.${String(datum.getMonth() + 1).padStart(2, '0')}.${datum.getFullYear()}`,
        };

        // Die Person steckt in der customId, nicht im Formular: sie ist die Autorin der Nachricht
        // und darf nicht umgeschrieben werden - an ihr hängt das Löschrecht.
        const customId = `${MODAL_PREFIX}:neu:${nachricht.author.id}:${nachricht.channelId}:${nachricht.id}`;
        return interaction.showModal(baueModal(customId, 'Zitat speichern', vorbelegung));
    }

    // Beide Modal-Wege laufen hier zusammen. Wie die Button-Handler prüft er selbst per Prefix, ob
    // er zuständig ist - der zentrale Verteiler kennt die einzelnen Features nicht.
    async handleModal(interaction: ModalSubmitInteraction) {
        if (!interaction.customId.startsWith(`${MODAL_PREFIX}:`)) {
            return;
        }

        const [, modus, ...rest] = interaction.customId.split(':');
        const text = interaction.fields.getTextInputValue(FELD_TEXT).trim();
        const kontext = interaction.fields.getTextInputValue(FELD_KONTEXT).trim() || null;
        const datum = parseDatum(interaction.fields.getTextInputValue(FELD_DATUM));

        if (!datum.ok) {
            return interaction.reply({
                content: 'Das Datum konnte ich nicht lesen. Erwartet ist `TT.MM.JJJJ` (z. B. `12.03.2026`) – oder du lässt das Feld leer.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (modus === 'neu') {
            const [personId, channelId, messageId] = rest;
            const zitat = await bashService.speichereNeu({
                text,
                personId,
                kontext,
                datum: datum.wert,
                erstellerId: interaction.user.id,
                erstelltAm: new Date().toISOString(),
                quelle: {channelId, messageId},
            });
            // Öffentlich: das Festhalten ist der halbe Spaß, und die zitierte Person soll sehen können,
            // dass sie in der Sammlung steht (löschen darf sie es selbst).
            return this.zeigeZitat(interaction, zitat);
        }

        if (modus === 'bearbeiten') {
            const nummer = Number(rest[0]);
            const zitat = await bashService.aktualisiere(nummer, {text, kontext, datum: datum.wert});
            if (!zitat) {
                return interaction.reply({
                    content: `Zitat #${nummer} gibt es nicht mehr – wurde es zwischenzeitlich entfernt?`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            return this.zeigeZitat(interaction, zitat);
        }
    }

    async handleZitat(interaction: ChatInputCommandInteraction) {
        const nummer = interaction.options.getInteger('nummer');

        if (nummer !== null) {
            const zitat = await bashService.hole(nummer);
            if (!zitat) {
                return interaction.reply({
                    content: `Ein Zitat #${nummer} habe ich nicht. Gelöschte Nummern werden nicht neu vergeben, da bleibt also eine Lücke.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            return this.zeigeZitat(interaction, zitat);
        }

        const zufall = await bashService.holeZufaellig();
        if (!zufall) {
            return interaction.reply({
                content: 'Die Zitatsammlung ist noch leer. Rechtsklick auf eine Nachricht (mobil: gedrückt halten) → Apps → „Als Bash-Zitat speichern" füllt sie.',
                flags: MessageFlags.Ephemeral,
            });
        }
        return this.zeigeZitat(interaction, zufall);
    }

    async handleBearbeiten(interaction: ChatInputCommandInteraction) {
        const nummer = interaction.options.getInteger('nummer', true);
        const zitat = await bashService.hole(nummer);

        if (!zitat) {
            return interaction.reply({content: `Ein Zitat #${nummer} habe ich nicht.`, flags: MessageFlags.Ephemeral});
        }
        if (!darfBearbeiten(zitat, interaction)) {
            return interaction.reply({
                content: 'Bearbeiten darf nur, wer das Zitat angelegt hat – oder ein Admin.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const customId = `${MODAL_PREFIX}:bearbeiten:${zitat.nummer}`;
        return interaction.showModal(baueModal(customId, `Zitat #${zitat.nummer} bearbeiten`, {
            text: zitat.text,
            kontext: zitat.kontext ?? '',
            datum: formatDatum(zitat.datum) ?? '',
        }));
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        const nummer = interaction.options.getInteger('nummer', true);
        const zitat = await bashService.hole(nummer);

        if (!zitat) {
            return interaction.reply({content: `Ein Zitat #${nummer} habe ich nicht.`, flags: MessageFlags.Ephemeral});
        }
        if (!darfEntfernen(zitat, interaction)) {
            return interaction.reply({
                content: 'Entfernen darf nur, wer das Zitat angelegt hat, wer darin zitiert wird – oder ein Admin.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await bashService.entferne(nummer);
        return interaction.reply({
            content: `Zitat #${nummer} ist weg. Die Nummer bleibt frei, damit ältere Verweise darauf nicht plötzlich etwas anderes zeigen.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    // Bestandsmeldung. Genannt wird zusätzlich die höchste vergebene Nummer: weil gelöschte
    // Nummern nie nachrücken, ist "42 Zitate" allein irreführend - wer daraus auf /bash zitat 42
    // schließt, kann in einer Lücke landen.
    async handleAnzahl(interaction: ChatInputCommandInteraction) {
        const alle = await bashService.holeAlle();

        if (!alle.length) {
            return interaction.reply({
                content: 'Die Zitatsammlung ist noch leer. Rechtsklick auf eine Nachricht (mobil: gedrückt halten) → Apps → „Als Bash-Zitat speichern" füllt sie.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const hoechste = alle[alle.length - 1].nummer;
        const bestand = alle.length === 1 ? 'steht **1 Zitat**' : `stehen **${alle.length} Zitate**`;
        return interaction.reply(`In der Zitatsammlung ${bestand}, die höchste Nummer ist #${hoechste}.`);
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Zitat-Befehle**\n\n` +
            `**Zitat festhalten:** Rechtsklick auf die Nachricht (mobil: gedrückt halten) → Apps → „Als Bash-Zitat speichern". ` +
            `Wortlaut, Ort/Kontext und Datum kannst du im Formular noch anpassen oder leer lassen.\n\n` +
            `**/bash zitat** – ein zufälliges Zitat, mit \`nummer\` genau das gewünschte\n` +
            `**/bash bearbeiten** – Wortlaut/Kontext/Datum ändern (nur eigene Zitate, Admins alle)\n` +
            `**/bash entfernen** – Zitat löschen (eigene, solche über dich selbst, Admins alle)\n` +
            `**/bash anzahl** – wie viele Zitate bislang gesammelt wurden\n` +
            `**/bash hilfe** – Zeigt diese Übersicht`
        );
    }
}

export default new BashHandler();
