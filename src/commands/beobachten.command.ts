import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import beobachtenHandler from '../handlers/beobachten.handler.js';

// Bewusst OHNE Admin-Beschränkung: jede:r pflegt die eigene Liste und bekommt die eigene DM.
// Fremde Listen kann niemand einsehen (siehe beobachten.handler.ts).
export default {
    data: new SlashCommandBuilder()
        .setName('beobachten')
        .setDescription('Bekomme eine DM, wenn ein bestimmter Charakter im Spiel online geht')
        .addSubcommand(subcommand => subcommand
            .setName('hinzufuegen')
            .setDescription('Setzt einen Charakternamen auf deine Beobachtungsliste')
            .addStringOption(option => option
                .setName('name')
                .setDescription('Name des Charakters ohne Titel, z.B. Acaine')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('entfernen')
            .setDescription('Nimmt einen Namen wieder von deiner Liste')
            .addStringOption(option => option
                .setName('name')
                .setDescription('Name des Charakters')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('liste')
            .setDescription('Zeigt, wen du gerade beobachtest'))
        .addSubcommand(subcommand => subcommand
            .setName('hilfe')
            .setDescription('Erklaert die Beobachtungs-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'hinzufuegen':
                return beobachtenHandler.handleHinzufuegen(interaction);
            case 'entfernen':
                return beobachtenHandler.handleEntfernen(interaction);
            case 'liste':
                return beobachtenHandler.handleListe(interaction);
            case 'hilfe':
                return beobachtenHandler.handleHilfe(interaction);
        }
    }
};
