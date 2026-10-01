import {
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits
} from 'discord.js';

import campService from '../services/camp.service.js';
import ankuendigungskanalService from '../services/ankuendigungskanal.service.js';

class CampHandler {
    async handleRessourcen(
        interaction: ChatInputCommandInteraction
    ): Promise<void> {
        const fortschritt = await campService.getCampFortschrittSeitStart();

        if (fortschritt === null) {
            await interaction.reply('Das Camp wurde noch nicht gestartet.');
            return;
        }

        const rundeFuerAnzeige = (wert: number): number =>
            Math.round(wert * 10) / 10;

        const nichtNegativFuerAnzeige = (wert: number): number =>
            Math.max(0, rundeFuerAnzeige(wert));

        const {aktuell, insgesamt, aktuelleStufe, naechsteStufe} = fortschritt;

        let antwort = `**Camp-Ressourcen**\n\n`;

        antwort +=
            `**Aktueller Stand:**\n` +
            `Phase ${aktuelleStufe.phase} – ${aktuelleStufe.name}\n\n`;

        if (naechsteStufe) {
            antwort +=
                `**Aktuell:**\n` +
                `${nichtNegativFuerAnzeige(aktuell.baumaterial)}/${naechsteStufe.kosten.baumaterial} BM\n` +
                `${nichtNegativFuerAnzeige(aktuell.vorraete)}/${naechsteStufe.kosten.vorraete} Vorräte\n\n`;
        } else {
            antwort +=
                `**Aktuell:**\n` +
                `${nichtNegativFuerAnzeige(aktuell.baumaterial)} BM\n` +
                `${nichtNegativFuerAnzeige(aktuell.vorraete)} Vorräte\n\n`;
        }

        antwort +=
            `**Insgesamt gesammelt:**\n` +
            `${rundeFuerAnzeige(insgesamt.baumaterial)} BM\n` +
            `${rundeFuerAnzeige(insgesamt.vorraete)} Vorräte`;

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
            `\`/camp hilfe\` – zeigt diese Hilfe\n` +
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

        const channel =
            await ankuendigungskanalService.holeAnkuendigungskanal();

        if (!channel) {
            return;
        }

        let currentLevel = await campService.getCurrentLevel();

        for (const stufe of erreichteStufen) {
            await channel.send(
                `Camp-Ausbau abgeschlossen: **Phase ${stufe.phase}, Stufe ${stufe.stufe} – ${stufe.name}**`
            );

            currentLevel++;

            await campService.setCurrentLevel(currentLevel);
        }
    }
}

export default new CampHandler();
