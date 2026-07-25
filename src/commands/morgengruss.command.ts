import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import greetingHandler from '../handlers/greeting.handler.js';

// Der Kanal wird jetzt über die Web-Konfigurationsseite (/config) gesetzt; hier bleibt nur das
// Auffrischen der gelernten Emojis (der Historien-Scan, den früher auch das kanal-Setzen auslöste).
export default {
    data: new SlashCommandBuilder()
        .setName('morgengruss')
        .setDescription('Morgengruß-Tradition: erste Nachricht des Tages begrüßen (nur Admins)')
        .addSubcommand(sub => sub
            .setName('lernen')
            .setDescription('Persönliche Emojis aus der bisherigen Chat-Historie auffrischen')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'lernen':
                return greetingHandler.handleLernen(interaction);
        }
    }
};
