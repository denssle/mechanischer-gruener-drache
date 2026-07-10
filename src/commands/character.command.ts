import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import characterHandler from '../handlers/character.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('charakter')
        .setDescription('Charakter-Infos aus der LotGD-Kriegerliste (lotgd.de)')
        .addSubcommand(sub => sub
            .setName('verknuepfen')
            .setDescription('Deinen LotGD-Charakter hinterlegen (nur der oeffentliche Name)')
            .addStringOption(option => option
                .setName('name')
                .setDescription('Dein Charaktername (ohne Titel-Praefix)')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('anzeigen')
            .setDescription('Charakter-Karte anzeigen; ohne Name deinen verknuepften')
            .addStringOption(option => option
                .setName('name')
                .setDescription('Charaktername (optional)')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('entfernen')
            .setDescription('Deine Charakter-Verknuepfung loeschen'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfuegbaren Charakter-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'verknuepfen':
                return characterHandler.handleVerknuepfen(interaction);
            case 'anzeigen':
                return characterHandler.handleAnzeigen(interaction);
            case 'entfernen':
                return characterHandler.handleEntfernen(interaction);
            case 'hilfe':
                return characterHandler.handleHilfe(interaction);
        }
    }
};
