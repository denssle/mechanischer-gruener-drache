import {ChatInputCommandInteraction, MessageFlags} from 'discord.js';
import rpService, {RpArt} from '../services/rp.service.js';

// Menschlich lesbare Beschriftung je Art. Exportiert + getestet, weil sie an mehreren Stellen
// (Bestätigung + Liste) auftaucht und der einzige Ort ist, an dem die internen Werte übersetzt werden.
export function formatArt(art: RpArt): string {
    switch (art) {
        case 'pbp':
            return 'PbP';
        case 'live':
            return 'Live';
        case 'beides':
            return 'PbP & Live';
    }
}

class RpHandler {
    async handleSuche(interaction: ChatInputCommandInteraction) {
        const art = interaction.options.getString('art', true) as RpArt;

        await rpService.setSuchend(interaction.user.id, art);

        return interaction.reply({
            content:
                `Du bist jetzt als **RP-suchend** eingetragen (${formatArt(art)}).\n` +
                `Mit \`/rollenspiel beenden\` meldest du dich wieder ab.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleBeenden(interaction: ChatInputCommandInteraction) {
        if (!(await rpService.istSuchend(interaction.user.id))) {
            return interaction.reply({
                content: 'Du warst gar nicht als RP-suchend eingetragen.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await rpService.entferneSuchend(interaction.user.id);

        return interaction.reply({
            content: 'Du bist nicht mehr als RP-suchend eingetragen.',
            flags: MessageFlags.Ephemeral,
        });
    }

    async handleSuchende(interaction: ChatInputCommandInteraction) {
        const suchende = await rpService.getSuchende();
        const eintraege = Object.entries(suchende);

        if (eintraege.length === 0) {
            return interaction.reply('Aktuell sucht niemand nach Roleplay. Mit `/rollenspiel suche` kannst du dich melden.');
        }

        const zeilen = eintraege.map(([userId, art]) => `- <@${userId}> – ${formatArt(art)}`);

        // Die Erwähnungen sind zum Anklicken/Sehen gedacht, nicht zum Anpingen (allowedMentions leer).
        return interaction.reply({
            content: `**Diese Leute suchen gerade Roleplay:**\n${zeilen.join('\n')}`,
            allowedMentions: {parse: []},
        });
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Roleplay-Befehle**\n\n` +
            `**/rollenspiel suche** – Melde dich als RP-suchend (Art: PbP, Live oder beides)\n` +
            `**/rollenspiel suchende** – Zeigt alle, die gerade Roleplay suchen\n` +
            `**/rollenspiel beenden** – Nimmt dich wieder von der Liste\n` +
            `**/rollenspiel hilfe** – Zeigt diese Übersicht`
        );
    }
}

export default new RpHandler();
