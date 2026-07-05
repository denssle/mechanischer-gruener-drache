import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits} from 'discord.js';
import sportService from '../services/sport.service.js';
import {SportActivities, SportActivity} from '../types/sport.js';

class SportHandler {
    async handleEintragen(interaction: ChatInputCommandInteraction) {
        const aktivitaet = interaction.options.getString('aktivitaet', true) as SportActivity;
        const kilometer = interaction.options.getNumber('kilometer', true);

        const entry = await sportService.addEntry(interaction.user.id, aktivitaet, kilometer);
        const aktivitaetLabel = SportActivities[aktivitaet];

        // Direkt nach dem Eintrag die neue gemeinsame Gesamtdistanz zeigen - passt zum
        // kooperativen Design (jeder Eintrag zahlt sichtbar auf die Gruppensumme ein).
        const gesamtKilometer = await sportService.getGesamtKilometer();

        return interaction.reply(
            `✅ Eintrag gespeichert!\n` +
            `${aktivitaetLabel} – **${kilometer} km**\n` +
            `🌍 Gemeinsam schon **${gesamtKilometer} km**!\n` +
            `Eintrags-ID: \`${entry.id}\``
        );
    }

    async handleLoeschen(interaction: ChatInputCommandInteraction) {
        const entryId = interaction.options.getString('eintrag-id', true);
        const success = await sportService.deleteEntry(interaction.user.id, entryId);

        if (!success) {
            return interaction.reply('❌ Eintrag nicht gefunden oder gehört dir nicht.');
        }

        return interaction.reply('✅ Eintrag erfolgreich gelöscht.');
    }

    async handleBearbeiten(interaction: ChatInputCommandInteraction) {
        const entryId = interaction.options.getString('eintrag-id', true);
        const kilometer = interaction.options.getNumber('kilometer', true);

        const entry = await sportService.editEntry(interaction.user.id, entryId, kilometer);

        if (!entry) {
            return interaction.reply('❌ Eintrag nicht gefunden oder gehört dir nicht.');
        }

        const aktivitaetLabel = SportActivities[entry.activity as SportActivity];
        return interaction.reply(
            `✅ Eintrag aktualisiert!\n` +
            `${aktivitaetLabel} – jetzt **${kilometer} km**`
        );
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
            `🏁 Gesamt: **${gesamtKilometer} km**`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `📖 **Sport-Befehle**\n\n` +
            `**/sport eintragen** – Neue sportliche Aktivität eintragen\n` +
            `**/sport loeschen** – Eintrag anhand der ID löschen\n` +
            `**/sport bearbeiten** – Kilometeranzahl eines Eintrags korrigieren\n` +
            `**/sport gesamt** – Gesamtkilometer aller Sportler\n` +
            `**/sport statistik** – Deine persönliche Übersicht pro Aktivität\n` +
            `**/sport setzen** – Kilometerstand eines Mitglieds setzen (nur Admins)\n` +
            `**/sport altkilometer** – Altkilometer ohne zugeordnetes Mitglied einspeisen (nur Admins)\n` +
            `**/sport altkilometer-setzen** – Bestandskilometer setzen/entfernen (0 = weg) (nur Admins)\n` +
            `**/sport hilfe** – Zeigt diese Übersicht`
        );
    }

    async handleSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const user = interaction.options.getUser('mitglied', true);
        const kilometer = interaction.options.getNumber('kilometer', true);

        await sportService.setKilometer(user.id, kilometer);

        return interaction.reply(
            `✅ Kilometerstand von <@${user.id}> wurde auf **${kilometer} km** gesetzt.`
        );
    }

    async handleGesamt(interaction: ChatInputCommandInteraction) {
        const gesamtKilometer = await sportService.getGesamtKilometer();

        return interaction.reply(
            `🌍 **Gesamtkilometer**\n\n` +
            `Zusammen habt ihr bereits **${gesamtKilometer} km** zurückgelegt!`
        );
    }

    async handleAltkilometer(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        await sportService.addLegacyKilometer(kilometer);

        return interaction.reply(
            `✅ **${kilometer} km** wurden als Altdaten eingespeist.`
        );
    }

    async handleAltkilometerSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        const vorher = await sportService.getLegacyKilometer();
        await sportService.setLegacyKilometer(kilometer);

        if (kilometer <= 0) {
            return interaction.reply(
                `✅ Bestandskilometer entfernt (vorher **${vorher} km**).`
            );
        }

        return interaction.reply(
            `✅ Bestandskilometer auf **${kilometer} km** gesetzt (vorher **${vorher} km**).`
        );
    }
}

export default new SportHandler();
