import {ChatInputCommandInteraction, EmbedBuilder} from 'discord.js';
import characterService, {CharacterEntry, findInRoster} from '../services/character.service.js';

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
    `\`/charakter anzeigen [name:<Name>]\` – Charakter-Karte anzeigen; ohne Name deinen verknüpften.\n` +
    `\`/charakter entfernen\` – deine Verknüpfung löschen.\n\n` +
    `Alle Daten stammen aus der öffentlichen Kriegerliste von lotgd.de – kein Login, keine Passwörter.`;

function buildCard(entry: CharacterEntry): EmbedBuilder {
    const lines = [
        `Stufe ${entry.level} · ${entry.rasse} · ${entry.geschlecht}`,
        `Ort: ${entry.ort}`,
    ];
    if (entry.gilde) {
        lines.push(`Gilde: ${entry.gilde}`);
    }
    if (entry.lebt) {
        lines.push(`lebendig · zuletzt gesehen: ${entry.zuletztDa}`);
    } else {
        lines.push(`tot – ${randomTotenFlavor()}`);
        lines.push(`zuletzt gesehen: ${entry.zuletztDa}`);
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

        return interaction.editReply({
            content: `Charakter **${entry.name}** verknüpft!`,
            embeds: [buildCard(entry)],
        });
    }

    async handleAnzeigen(interaction: ChatInputCommandInteraction) {
        const provided = interaction.options.getString('name', false)?.trim();

        await interaction.deferReply();

        const name = provided ?? await characterService.getLinkedName(interaction.user.id);
        if (!name) {
            return interaction.editReply(
                'Du hast keinen Charakter verknüpft. Nutze `/charakter verknuepfen name:<Name>` ' +
                'oder gib direkt einen Namen an: `/charakter anzeigen name:<Name>`.'
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

        return interaction.editReply({embeds: [buildCard(entry)]});
    }

    async handleEntfernen(interaction: ChatInputCommandInteraction) {
        const removed = await characterService.unlinkCharacter(interaction.user.id);
        if (!removed) {
            return interaction.reply('Du hast keinen Charakter verknüpft.');
        }

        return interaction.reply('Deine Charakter-Verknüpfung wurde entfernt.');
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(CHARAKTER_HELP);
    }
}

export default new CharacterHandler();
