import {ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, TextChannel} from 'discord.js';
import sportService from '../services/sport.service.js';
import {SportActivities, SportActivity} from '../types/sport.js';
import client from '../client.js';

// Zufällige, motivierende Flavor-Zeile für die Eintrags-Bestätigung - die konkrete
// Aktivität/Distanz hängt der Handler danach an. Exportiert + getestet (wie die Ping-Pong-Flavors).
export const EINTRAG_FLAVORS = [
    'Stark, das zahlt sich aus!',
    'Weiter so – jeder Kilometer zählt!',
    'Klasse gemacht!',
    'Ordentlich was geschafft!',
    'Respekt, das war Bewegung!',
    'Super, die Gruppe dankt dir!',
    'Wieder ein Stück weiter gekommen!',
];

export function randomEintragFlavor(): string {
    return EINTRAG_FLAVORS[Math.floor(Math.random() * EINTRAG_FLAVORS.length)];
}

class SportHandler {
    async handleEintragen(interaction: ChatInputCommandInteraction) {
        const aktivitaet = interaction.options.getString('aktivitaet', true) as SportActivity;
        const kilometer = interaction.options.getNumber('kilometer', true);

        const entry = await sportService.addEntry(interaction.user.id, aktivitaet, kilometer);
        const aktivitaetLabel = SportActivities[aktivitaet];

        // Direkt nach dem Eintrag die neue gemeinsame Gesamtdistanz zeigen - passt zum
        // kooperativen Design (jeder Eintrag zahlt sichtbar auf die Gruppensumme ein).
        const gesamtKilometer = await sportService.getGesamtKilometer();

        // Persönlicher: der eintragende User steht mit Name + Profilbild oben im Embed, damit
        // sich jede/r im Post wiederfindet. Eintrags-ID bleibt im Footer sichtbar (für loeschen/bearbeiten).
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setAuthor({
                name: interaction.user.displayName,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .setDescription(
                `${randomEintragFlavor()}\n` +
                `${aktivitaetLabel} – **${kilometer} km**\n` +
                `Gemeinsam schon **${gesamtKilometer} km**!`
            )
            .setFooter({text: `Eintrags-ID: ${entry.id}`});

        await interaction.reply({embeds: [embed]});
        await this.announceReachedMilestones();
    }

    async handleLoeschen(interaction: ChatInputCommandInteraction) {
        const entryId = interaction.options.getString('eintrag-id', true);
        const success = await sportService.deleteEntry(interaction.user.id, entryId);

        if (!success) {
            return interaction.reply('Eintrag nicht gefunden oder gehört dir nicht.');
        }

        return interaction.reply('Eintrag erfolgreich gelöscht.');
    }

    async handleBearbeiten(interaction: ChatInputCommandInteraction) {
        const entryId = interaction.options.getString('eintrag-id', true);
        const kilometer = interaction.options.getNumber('kilometer', true);

        const entry = await sportService.editEntry(interaction.user.id, entryId, kilometer);

        if (!entry) {
            return interaction.reply('Eintrag nicht gefunden oder gehört dir nicht.');
        }

        const aktivitaetLabel = SportActivities[entry.activity as SportActivity];
        await interaction.reply(
            `Eintrag aktualisiert!\n` +
            `${aktivitaetLabel} – jetzt **${kilometer} km**`
        );
        await this.announceReachedMilestones();
    }

    async handleStatistik(interaction: ChatInputCommandInteraction) {
        const entries = await sportService.getUserEntries(interaction.user.id);

        if (!entries.length) {
            return interaction.reply('Du hast noch keine Einträge. Los geht\'s mit `/sport eintragen`!');
        }

        const gesamtKilometer = entries.reduce((sum, e) => sum + e.kilometers, 0);

        const proAktivitaet = entries.reduce((acc, e) => {
            acc[e.activity] = (acc[e.activity] ?? 0) + e.kilometers;
            return acc;
        }, {} as Record<string, number>);

        const aktivitaetsListe = Object.entries(proAktivitaet)
            .sort(([, a], [, b]) => b - a)
            .map(([key, km]) => `${SportActivities[key as SportActivity]} – ${km} km`)
            .join('\n');

        return interaction.reply(
            `**Deine Statistik**\n\n` +
            `${aktivitaetsListe}\n\n` +
            `Gesamt: **${gesamtKilometer} km**`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Sport-Befehle**\n\n` +
            `**/sport eintragen** – Neue sportliche Aktivität eintragen\n` +
            `**/sport loeschen** – Eintrag anhand der ID löschen\n` +
            `**/sport bearbeiten** – Kilometeranzahl eines Eintrags korrigieren\n` +
            `**/sport gesamt** – Gesamtkilometer aller Sportler\n` +
            `**/sport statistik** – Deine persönliche Übersicht pro Aktivität\n` +
            `**/sport meilenstein setzen** – Einen Meilenstein für die gemeinsame Gesamtdistanz anlegen\n` +
            `**/sport hilfe** – Zeigt diese Übersicht`
        );
    }

    async handleSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const user = interaction.options.getUser('mitglied', true);
        const kilometer = interaction.options.getNumber('kilometer', true);

        await sportService.setKilometer(user.id, kilometer);

        await interaction.reply(
            `Kilometerstand von <@${user.id}> wurde auf **${kilometer} km** gesetzt.`
        );
        await this.announceReachedMilestones();
    }

    async handleGesamt(interaction: ChatInputCommandInteraction) {
        const gesamtKilometer = await sportService.getGesamtKilometer();

        return interaction.reply(
            `**Gesamtkilometer**\n\n` +
            `Zusammen habt ihr bereits **${gesamtKilometer} km** zurückgelegt!`
        );
    }

    async handleAltkilometer(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        await sportService.addLegacyKilometer(kilometer);

        await interaction.reply(
            `**${kilometer} km** wurden als Altdaten eingespeist.`
        );
        await this.announceReachedMilestones();
    }

    async handleAltkilometerSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        const vorher = await sportService.getLegacyKilometer();
        await sportService.setLegacyKilometer(kilometer);

        await interaction.reply(kilometer <= 0
            ? `Bestandskilometer entfernt (vorher **${vorher} km**).`
            : `Bestandskilometer auf **${kilometer} km** gesetzt (vorher **${vorher} km**).`
        );
        await this.announceReachedMilestones();
    }

    async handleMeilensteinSetzen(interaction: ChatInputCommandInteraction) {
        const kilometer = interaction.options.getNumber('kilometer', true);
        // Wie bei /rollenbutton: literal getipptes \n wird zu echten Zeilenumbrüchen, damit
        // mehrzeilige, formatierte Ankündigungstexte möglich sind (Slash-Eingaben erlauben kein Enter).
        const text = interaction.options.getString('text', true).replaceAll('\\n', '\n');

        await sportService.setMilestone(kilometer, text);

        return interaction.reply(
            `Meilenstein bei **${kilometer} km** gespeichert. ` +
            `Sobald die gemeinsame Gesamtdistanz das erreicht, wird der Text im Ankündigungskanal gepostet.`
        );
    }

    async handleMeilensteinListe(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const milestones = await sportService.getMilestones();
        if (!milestones.length) {
            return interaction.reply('Es sind keine Meilensteine gesetzt. Leg einen mit `/sport meilenstein setzen` an.');
        }

        // Nur die erste Zeile des (evtl. mehrzeiligen) Textes als Vorschau, sonst wird die Liste zu lang.
        const lines = milestones.map(m =>
            `**${m.kilometers} km** [${m.announced ? 'gefeiert' : 'offen'}] – ${m.text.split('\n')[0]}`
        );

        return interaction.reply(
            `**Meilensteine**\n\n${lines.join('\n')}`
        );
    }

    async handleMeilensteinEntfernen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        const removed = await sportService.removeMilestone(kilometer);

        return interaction.reply(removed
            ? `Meilenstein bei **${kilometer} km** entfernt.`
            : `Kein Meilenstein bei **${kilometer} km** gefunden.`
        );
    }

    async handleAnkuendigungskanal(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('kanal', true);
        await sportService.setAnnouncementChannel(channel.id);

        return interaction.reply(
            `Meilenstein-Ankündigungen werden ab jetzt in <#${channel.id}> gepostet.`
        );
    }

    // Postet neu erreichte Meilensteine in den Ankündigungskanal. Bewusst fehlertolerant: darf
    // eine erfolgreich eingetragene Aktivität niemals nachträglich scheitern lassen (daher try/catch).
    // Ohne konfigurierten/abrufbaren Kanal wird NICHT als announced markiert - so wird die Feier
    // nachgeholt, sobald ein Kanal existiert und die Summe erneut steigt.
    private async announceReachedMilestones(): Promise<void> {
        try {
            const channelId = await sportService.getAnnouncementChannel();
            if (!channelId) {
                return;
            }

            const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
            if (!channel) {
                console.warn(`⚠️ Sport-Ankündigungskanal ${channelId} nicht abrufbar - Meilenstein-Meldung(en) werden verworfen.`);
                return;
            }

            const reached = await sportService.checkAndMarkReachedMilestones();
            for (const milestone of reached) {
                try {
                    await channel.send(milestone.text);
                } catch (error) {
                    console.error(`Fehler beim Posten des Sport-Meilensteins (${milestone.kilometers} km):`, error);
                }
            }
        } catch (error) {
            console.error('Fehler beim Prüfen/Posten der Sport-Meilensteine:', error);
        }
    }
}

export default new SportHandler();
