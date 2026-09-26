import {ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextChannel} from 'discord.js';
import campService from '../services/camp.service.js';
import sportService from '../services/sport.service.js';
import client from '../client.js';

class CampHandler {
    async handleRessourcen(
        interaction: ChatInputCommandInteraction
    ): Promise<void> {
        const fortschritt = await campService.getCampFortschrittSeitStart();

        if (fortschritt === null) {
            await interaction.reply('Das Camp wurde noch nicht gestartet.');
            return;
        }

        const {aktuell, insgesamt, naechsteStufe} = fortschritt;

        let antwort = `**Camp-Ressourcen**\n\n`;

        if (naechsteStufe) {
            antwort +=
                `**Aktuell:**\n` +
                `${aktuell.baumaterial}/${naechsteStufe.kosten.baumaterial} BM\n` +
                `${aktuell.vorraete}/${naechsteStufe.kosten.vorraete} Vorräte\n\n`;
        } else {
            antwort +=
                `**Aktuell:**\n` +
                `${aktuell.baumaterial} BM\n` +
                `${aktuell.vorraete} Vorräte\n\n`;
        }

        antwort +=
            `**Insgesamt gesammelt:**\n` +
            `${insgesamt.baumaterial} BM\n` +
            `${insgesamt.vorraete} Vorräte`;

        if (naechsteStufe) {
            antwort +=
                `\n\n**Nächste Stufe:**\n` +
                `Phase ${naechsteStufe.phase}, Stufe ${naechsteStufe.stufe} – ${naechsteStufe.name}`;
        }

        await interaction.reply(antwort);
    }

    async handleHilfe(
        interaction: ChatInputCommandInteraction
    ): Promise<void> {
        await interaction.reply(
            `**Camp-Hilfe**\n\n` +
            `\`/camp ressourcen\` – zeigt die aktuellen und insgesamt gesammelten Camp-Ressourcen sowie die nächste Stufe\n` +
            `\`/camp hilfe\` – zeigt diese Hilfe` +
            `\`/camp starten\` – startet das Camp (nur für Administratoren)\n`
        );
    }

    async handleStarten(
        interaction: ChatInputCommandInteraction
    ): Promise<void> {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const vorhandenesStartDate = await campService.getCampStartDate();

        if (vorhandenesStartDate !== null) {
            await interaction.reply({
                content: 'Das Camp wurde bereits gestartet.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await campService.initialisiereCamp(new Date());

        await interaction.reply(
            'Das Camp wurde gestartet. Ab jetzt werden Kilometer und Aktivitätsminuten für den Camp-Fortschritt gesammelt.'
        );
    }

    async pruefeFortschritt(): Promise<void> {
        const erreichteStufen =
            await campService.pruefeCampFortschrittSeitStart();

        if (erreichteStufen.length === 0) {
            return;
        }

        const channelId = await sportService.getAnnouncementChannel();
        if (!channelId) {
            return;
        }

        const channel = await client.channels.fetch(channelId)
            .catch(() => null) as TextChannel | null;

        if (!channel) {
            return;
        }

        for (const stufe of erreichteStufen) {
            await channel.send(
                `Camp-Ausbau abgeschlossen: **Phase ${stufe.phase}, Stufe ${stufe.stufe} – ${stufe.name}**`
            );

            await campService.setCurrentLevel(stufe.stufe);
        }
    }
}

export default new CampHandler();
