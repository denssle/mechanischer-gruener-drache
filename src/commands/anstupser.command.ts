import {ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import anstupserHandler from '../handlers/anstupser.handler.js';

// Bewusst OHNE Admin-Beschränkung: jede:r meldet sich selbst an und wieder ab. Der Bot schreibt
// niemanden ungefragt an (Opt-in, siehe anstupser.handler.ts).
export default {
    data: new SlashCommandBuilder()
        .setName('anstupser')
        .setDescription('Taeglich um 13:37 eine DM vom Bot - freiwillig, selbst an- und abmeldbar')
        .addSubcommand(subcommand => subcommand
            .setName('an')
            .setDescription('Meldet dich fuer den taeglichen Anstupser um 13:37 an'))
        .addSubcommand(subcommand => subcommand
            .setName('aus')
            .setDescription('Meldet dich wieder ab'))
        .addSubcommand(subcommand => subcommand
            .setName('status')
            .setDescription('Zeigt, ob du angemeldet bist'))
        .addSubcommand(subcommand => subcommand
            .setName('hilfe')
            .setDescription('Erklaert die Anstupser-Befehle')),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'an':
                return anstupserHandler.handleAn(interaction);
            case 'aus':
                return anstupserHandler.handleAus(interaction);
            case 'status':
                return anstupserHandler.handleStatus(interaction);
            case 'hilfe':
                return anstupserHandler.handleHilfe(interaction);
        }
    }
};
