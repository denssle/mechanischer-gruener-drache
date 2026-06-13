import { ChatInputCommandInteraction } from 'discord.js';
import sportService from '../services/sport.service.js';
import userService from '../services/user.service.js';
import { SportActivities, SportActivity } from '../types/sport.js';

class SportHandler {
    async handleHinzufuegen(interaction: ChatInputCommandInteraction) {
        const aktivitaet = interaction.options.getString('aktivitaet', true) as SportActivity;
        const kilometer = interaction.options.getNumber('kilometer', true);

        const entry = await sportService.addEntry(interaction.user.id, aktivitaet, kilometer);
        const aktivitaetLabel = SportActivities[aktivitaet];

        return interaction.reply(
            `✅ Eintrag gespeichert!\n` +
            `${aktivitaetLabel} – **${kilometer} km**\n` +
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

    async handleBestenliste(interaction: ChatInputCommandInteraction) {
        const highscore = await sportService.getHighscore();

        if (!highscore.length) {
            return interaction.reply('Noch keine Einträge vorhanden.');
        }

        const users = await Promise.all(
            highscore.map(item => userService.getUser(item.userId))
        );

        const gesamtKilometer = highscore.reduce((sum, item) => sum + item.kilometers, 0);

        const liste = highscore
            .map((item, index) => {
                const displayName = users[index]?.displayName ?? item.userId;
                return `${index + 1}. **${displayName}** – ${item.kilometers} km`;
            })
            .join('\n');

        return interaction.reply(
            `🏆 **Bestenliste**\n\n${liste}\n\n` +
            `📊 Gesamt: **${gesamtKilometer} km** von allen Sportlern`
        );
    }

    async handleStatistik(interaction: ChatInputCommandInteraction) {
        const entries = await sportService.getUserEntries(interaction.user.id);

        if (!entries.length) {
            return interaction.reply('Du hast noch keine Einträge. Los geht\'s mit `/sport hinzufuegen`!');
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
            `📈 **Deine Statistik**\n\n` +
            `${aktivitaetsListe}\n\n` +
            `🏁 Gesamt: **${gesamtKilometer} km**`
        );
    }
}

export default new SportHandler();
