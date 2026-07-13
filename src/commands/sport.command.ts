import {ChannelType, ChatInputCommandInteraction, SlashCommandBuilder} from 'discord.js';
import sportHandler from '../handlers/sport.handler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sport')
        .setDescription('Sportliche Aktivitäten tracken')
        .addSubcommand(sub => sub
            .setName('eintragen')
            .setDescription('Neue sportliche Aktivität eintragen')
            .addStringOption(option => option
                .setName('aktivitaet')
                .setDescription('Art der Aktivität')
                .setRequired(true)
                .addChoices(
                    {name: '🏃 Laufen', value: 'laufen'},
                    {name: '🚴 Radfahren', value: 'radfahren'},
                    {name: '🏊 Schwimmen', value: 'schwimmen'},
                    {name: '🚶 Wandern', value: 'wandern'},
                    {name: '⛷️ Skifahren', value: 'skifahren'},
                ))
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Anzahl der Kilometer')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('loeschen')
            .setDescription('Sport Eintrag löschen')
            .addStringOption(option => option
                .setName('eintrag-id')
                .setDescription('ID des Eintrags')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('bearbeiten')
            .setDescription('Kilometer deines letzten Eintrags korrigieren')
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Neue Kilometeranzahl')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('statistik')
            .setDescription('Deine persönliche Sportstatistik'))
        .addSubcommand(sub => sub
            .setName('hilfe')
            .setDescription('Zeigt alle verfügbaren Sport-Befehle'))
        .addSubcommand(sub => sub
            .setName('setzen')
            .setDescription('Kilometer eines Mitglieds manuell setzen (nur Admins)')
            .addUserOption(option => option
                .setName('mitglied')
                .setDescription('Discord-Mitglied')
                .setRequired(true))
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Kilometerstand der gesetzt werden soll')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('gesamt')
            .setDescription('Gesamtkilometer aller Sportler'))
        .addSubcommand(sub => sub
            .setName('altkilometer')
            .setDescription('Altkilometer ohne zugeordnetes Mitglied einspeisen (nur Admins)')
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Anzahl der Kilometer')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('altkilometer-setzen')
            .setDescription('Bestandskilometer auf einen Wert setzen; 0 entfernt sie (nur Admins)')
            .addNumberOption(option => option
                .setName('kilometer')
                .setDescription('Neuer Bestandskilometer-Wert (0 = entfernen)')
                .setRequired(true)
                .setMinValue(0)))
        .addSubcommand(sub => sub
            .setName('ankuendigungskanal')
            .setDescription('Sport-Kanal festlegen: Meilenstein-Ankündigungen + Auto-Erfassung (nur Admins)')
            .addChannelOption(option => option
                .setName('kanal')
                .setDescription('Sport-Kanal (Ankündigungen landen hier, km-Angaben werden hier erfasst)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)))
        .addSubcommandGroup(group => group
            .setName('meilenstein')
            .setDescription('Meilensteine für die gemeinsame Gesamtdistanz')
            .addSubcommand(sub => sub
                .setName('setzen')
                .setDescription('Meilenstein mit Kilometerzahl und Ankündigungstext anlegen')
                .addNumberOption(option => option
                    .setName('kilometer')
                    .setDescription('Ab welcher Gesamtdistanz gefeiert wird')
                    .setRequired(true)
                    .setMinValue(1))
                .addStringOption(option => option
                    .setName('text')
                    .setDescription('Ankündigungstext (Markdown erlaubt, \\n für Zeilenumbruch)')
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('liste')
                .setDescription('Alle gesetzten Meilensteine anzeigen (nur Admins)'))
            .addSubcommand(sub => sub
                .setName('entfernen')
                .setDescription('Einen Meilenstein anhand der Kilometerzahl entfernen (nur Admins)')
                .addNumberOption(option => option
                    .setName('kilometer')
                    .setDescription('Kilometerzahl des zu entfernenden Meilensteins')
                    .setRequired(true)
                    .setMinValue(1)))),

    async execute(interaction: ChatInputCommandInteraction) {
        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        if (group === 'meilenstein') {
            switch (subcommand) {
                case 'setzen':
                    return sportHandler.handleMeilensteinSetzen(interaction);
                case 'liste':
                    return sportHandler.handleMeilensteinListe(interaction);
                case 'entfernen':
                    return sportHandler.handleMeilensteinEntfernen(interaction);
            }
            return;
        }

        switch (subcommand) {
            case 'eintragen':
                return sportHandler.handleEintragen(interaction);
            case 'loeschen':
                return sportHandler.handleLoeschen(interaction);
            case 'bearbeiten':
                return sportHandler.handleBearbeiten(interaction);
            case 'statistik':
                return sportHandler.handleStatistik(interaction);
            case 'hilfe':
                return sportHandler.handleHilfe(interaction);
            case 'setzen':
                return sportHandler.handleSetzen(interaction);
            case 'gesamt':
                return sportHandler.handleGesamt(interaction);
            case 'altkilometer':
                return sportHandler.handleAltkilometer(interaction);
            case 'altkilometer-setzen':
                return sportHandler.handleAltkilometerSetzen(interaction);
            case 'ankuendigungskanal':
                return sportHandler.handleAnkuendigungskanal(interaction);
        }
    }
};
