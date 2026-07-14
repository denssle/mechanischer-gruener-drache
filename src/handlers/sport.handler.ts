import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    Message,
    MessageFlags,
    OmitPartialGroupDMChannel,
    PermissionFlagsBits,
    TextChannel
} from 'discord.js';
import sportService from '../services/sport.service.js';
import {SportActivities, SportActivity} from '../types/sport.js';
import client from '../client.js';

// Ohne Schlüsselwort im Text wird Laufen angenommen (bewusst: lieber ein Eintrag mit der
// häufigsten Aktivität als gar keiner - die Distanz zählt fürs kooperative Gesamtziel).
export const DEFAULT_AKTIVITAET: SportActivity = 'laufen';

// Quittung der Auto-Erfassung. Funktionaler Statusmarker (wie im Audit-Log), keine Deko - er ist
// die einzige Rückmeldung, die ohne eigenen Post im Kanal auskommt.
export const BESTAETIGUNGS_REAKTION = '✅';

// Schlüsselwörter je Aktivität für den Auto-Listener. Bewusst am WORTANFANG verankert (\b) statt
// als simples includes: "rad" steckt sonst in "Grad" ("12 km bei 30 Grad") und "gerad" in "gerade"
// ("ich bin gerade 12 km") - beides würde fälschlich als Radfahren eingetragen.
const AKTIVITAET_PATTERNS: Record<SportActivity, RegExp> = {
    laufen: /\b(lauf|gelaufen|renn|gerannt|jogg)/i,
    radfahren: /\b(rad|fahrrad|geradelt|bike|velo)/i,
    schwimmen: /\b(schwimm|geschwommen|schwomm)/i,
    wandern: /\b(wander|gewandert)/i,
    skifahren: /\b(ski|langlauf)/i,
};

// Zieht die erste Kilometer-Angabe aus einem Text: "+12 km", "+12km", "+12,5 km", "+12 Kilometer".
// Das "+" ist PFLICHT (seit 2026-07-14): ohne den Marker wurde im Sport-Kanal auch beiläufig
// erwähnte Distanz ("die Strecke sind 12 km") eingetragen - der Eintrag ist jetzt eine bewusste Geste.
// Bewusst nur die ERSTE (anders als beim Blåhaj-Rechner, der alle Beträge summiert): eine
// versehentlich doppelt gezählte Distanz verfälscht die gemeinsame Gesamtstrecke dauerhaft.
// Exportiert + getestet.
export function parseKilometer(text: string): number | null {
    const match = /\+\s*(\d+(?:[.,]\d+)?)\s*(?:km\b|kilometer\b)/i.exec(text);
    if (!match) return null;

    const value = parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
}

// Rät die Aktivität anhand von Schlüsselwörtern; ohne Treffer DEFAULT_AKTIVITAET. Exportiert + getestet.
export function erkenneAktivitaet(text: string): SportActivity {
    for (const [aktivitaet, pattern] of Object.entries(AKTIVITAET_PATTERNS) as [SportActivity, RegExp][]) {
        if (pattern.test(text)) {
            return aktivitaet;
        }
    }

    return DEFAULT_AKTIVITAET;
}

class SportHandler {
    // Auto-Listener: erfasst Kilometer aus normalen Chat-Nachrichten - aber NUR im konfigurierten
    // Sport-Kanal (anders als der serverweite Blåhaj-Listener). Serverweit würde jedes beiläufige
    // "noch 3 km bis zum Bahnhof" die gemeinsame Gesamtdistanz verfälschen; zusätzlich muss die
    // Angabe seit 2026-07-14 mit "+" markiert sein (siehe parseKilometer).
    // Bot-Nachrichten werden ignoriert (die frühere Antwort enthielt "12 km" und hätte sich selbst
    // getriggert - bleibt als Schutz bestehen, falls je wieder geantwortet wird).
    //
    // Bestätigt wird seit 2026-07-14 nur noch per REAKTION auf die Nachricht, nicht mehr mit einer
    // eigenen Antwort im Kanal (User-Wunsch: die Bestätigung soll nicht alle im Kanal behelligen).
    // Eine wirklich private Antwort ist hier technisch unmöglich - ephemere Nachrichten hängen bei
    // Discord an einem Interaction-Token, den eine normale Chat-Nachricht nicht hat. Die Reaktion
    // ist der geräuschloseste Weg, der bleibt; die neue Gesamtdistanz nennt dafür /sport gesamt.
    async handleMessage(message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<void> {
        if (message.author.bot) return;

        const kanalId = await sportService.getAnnouncementChannel();
        if (!kanalId || message.channelId !== kanalId) return;

        const kilometer = parseKilometer(message.content);
        if (kilometer === null) return;

        const aktivitaet = erkenneAktivitaet(message.content);
        await sportService.addEntry(message.author.id, aktivitaet, kilometer);

        await message.react(BESTAETIGUNGS_REAKTION);
        await this.announceReachedMilestones();
    }

    async handleEintragen(interaction: ChatInputCommandInteraction) {
        const aktivitaet = interaction.options.getString('aktivitaet', true) as SportActivity;
        const kilometer = interaction.options.getNumber('kilometer', true);

        await sportService.addEntry(interaction.user.id, aktivitaet, kilometer);
        const aktivitaetLabel = SportActivities[aktivitaet];

        // Direkt nach dem Eintrag die neue gemeinsame Gesamtdistanz zeigen - passt zum
        // kooperativen Design (jeder Eintrag zahlt sichtbar auf die Gruppensumme ein).
        const gesamtKilometer = await sportService.getGesamtKilometer();

        // Persönlicher: der eintragende User steht mit Name + Profilbild oben im Embed. Die Antwort
        // ist seit 2026-07-14 ephemer (User-Wunsch: nur die eintragende Person sieht sie), das Embed
        // bleibt trotzdem - der Meilenstein bleibt der einzige Sport-Post, den alle im Kanal sehen.
        // Die Eintrags-ID braucht seit 2026-07-13 niemand mehr, deshalb kein Footer.
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setAuthor({
                name: interaction.user.displayName,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .setDescription(
                `${aktivitaetLabel} – **${kilometer} km**, gemeinsam schon **${gesamtKilometer} km**.`
            );

        await interaction.reply({embeds: [embed], flags: MessageFlags.Ephemeral});
        await this.announceReachedMilestones();
    }

    async handleLoeschen(interaction: ChatInputCommandInteraction) {
        const entry = await sportService.deleteLastEntry(interaction.user.id);

        if (!entry) {
            return interaction.reply('Du hast keinen Eintrag, den ich löschen könnte.');
        }

        // Nennt Aktivität + Distanz, damit sichtbar ist, was tatsächlich gelöscht wurde.
        const aktivitaetLabel = SportActivities[entry.activity as SportActivity];
        return interaction.reply(
            `Letzter Eintrag gelöscht: ${aktivitaetLabel} – **${entry.kilometers} km**.`
        );
    }

    async handleBearbeiten(interaction: ChatInputCommandInteraction) {
        const kilometer = interaction.options.getNumber('kilometer', true);

        const entry = await sportService.editLastEntry(interaction.user.id, kilometer);

        if (!entry) {
            return interaction.reply('Du hast noch keinen Eintrag, den ich korrigieren könnte.');
        }

        const aktivitaetLabel = SportActivities[entry.activity as SportActivity];
        await interaction.reply(
            `Letzter Eintrag korrigiert: ${aktivitaetLabel} – jetzt **${kilometer} km**.`
        );
        await this.announceReachedMilestones();
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
            `Gesamt: **${gesamtKilometer} km**`
        );
    }

    async handleHilfe(interaction: ChatInputCommandInteraction) {
        return interaction.reply(
            `**Sport-Befehle**\n\n` +
            `**/sport eintragen** – Neue sportliche Aktivität eintragen\n` +
            `**/sport loeschen** – Deinen letzten Eintrag löschen\n` +
            `**/sport bearbeiten** – Kilometer deines letzten Eintrags korrigieren\n` +
            `**/sport gesamt** – Gesamtkilometer aller Sportler\n` +
            `**/sport statistik** – Deine persönliche Übersicht pro Aktivität\n` +
            `**/sport meilenstein setzen** – Einen Meilenstein für die gemeinsame Gesamtdistanz anlegen\n` +
            `**/sport hilfe** – Zeigt diese Übersicht\n\n` +
            `Im Sport-Kanal genügt auch eine normale Nachricht: Wer „+12 km gelaufen" schreibt, ` +
            `bekommt den Eintrag automatisch – erkennbar an der Reaktion ${BESTAETIGUNGS_REAKTION} ` +
            `an der Nachricht. Das „+" vor den Kilometern ist nötig, ` +
            `ohne erkennbare Sportart wird Laufen angenommen.`
        );
    }

    async handleSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const user = interaction.options.getUser('mitglied', true);
        const kilometer = interaction.options.getNumber('kilometer', true);

        await sportService.setKilometer(user.id, kilometer);

        await interaction.reply(
            `Kilometerstand von <@${user.id}> wurde auf **${kilometer} km** gesetzt.`
        );
        await this.announceReachedMilestones();
    }

    async handleGesamt(interaction: ChatInputCommandInteraction) {
        const gesamtKilometer = await sportService.getGesamtKilometer();

        return interaction.reply(
            `Zusammen habt ihr bereits **${gesamtKilometer} km** zurückgelegt!`
        );
    }

    async handleAltkilometer(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        await sportService.addLegacyKilometer(kilometer);

        await interaction.reply(
            `**${kilometer} km** wurden als Altdaten eingespeist.`
        );
        await this.announceReachedMilestones();
    }

    async handleAltkilometerSetzen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        const vorher = await sportService.getLegacyKilometer();
        await sportService.setLegacyKilometer(kilometer);

        await interaction.reply(kilometer <= 0
            ? `Bestandskilometer entfernt (vorher **${vorher} km**).`
            : `Bestandskilometer auf **${kilometer} km** gesetzt (vorher **${vorher} km**).`
        );
        await this.announceReachedMilestones();
    }

    async handleMeilensteinSetzen(interaction: ChatInputCommandInteraction) {
        const kilometer = interaction.options.getNumber('kilometer', true);
        // Wie bei /rollenbutton: literal getipptes \n wird zu echten Zeilenumbrüchen, damit
        // mehrzeilige, formatierte Ankündigungstexte möglich sind (Slash-Eingaben erlauben kein Enter).
        const text = interaction.options.getString('text', true).replaceAll('\\n', '\n');

        await sportService.setMilestone(kilometer, text);

        return interaction.reply(
            `Meilenstein bei **${kilometer} km** gespeichert. ` +
            `Sobald die gemeinsame Gesamtdistanz das erreicht, wird der Text im Ankündigungskanal gepostet.`
        );
    }

    async handleMeilensteinListe(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const milestones = await sportService.getMilestones();
        if (!milestones.length) {
            return interaction.reply('Es sind keine Meilensteine gesetzt. Leg einen mit `/sport meilenstein setzen` an.');
        }

        // Nur die erste Zeile des (evtl. mehrzeiligen) Textes als Vorschau, sonst wird die Liste zu lang.
        const lines = milestones.map(m =>
            `**${m.kilometers} km** [${m.announced ? 'gefeiert' : 'offen'}] – ${m.text.split('\n')[0]}`
        );

        return interaction.reply(
            `**Meilensteine**\n\n${lines.join('\n')}`
        );
    }

    async handleMeilensteinEntfernen(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const kilometer = interaction.options.getNumber('kilometer', true);
        const removed = await sportService.removeMilestone(kilometer);

        return interaction.reply(removed
            ? `Meilenstein bei **${kilometer} km** entfernt.`
            : `Kein Meilenstein bei **${kilometer} km** gefunden.`
        );
    }

    async handleAnkuendigungskanal(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('kanal', true);
        await sportService.setAnnouncementChannel(channel.id);

        return interaction.reply(
            `<#${channel.id}> ist ab jetzt der Sport-Kanal: Meilensteine werden dort angekündigt, ` +
            `und mit „+" markierte Kilometer-Angaben („+12 km gelaufen") werden dort automatisch eingetragen.`
        );
    }

    // Postet neu erreichte Meilensteine in den Ankündigungskanal. Bewusst fehlertolerant: darf
    // eine erfolgreich eingetragene Aktivität niemals nachträglich scheitern lassen (daher try/catch).
    // Ohne konfigurierten/abrufbaren Kanal wird NICHT als announced markiert - so wird die Feier
    // nachgeholt, sobald ein Kanal existiert und die Summe erneut steigt.
    private async announceReachedMilestones(): Promise<void> {
        try {
            const channelId = await sportService.getAnnouncementChannel();
            if (!channelId) {
                return;
            }

            const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
            if (!channel) {
                console.warn(`⚠️ Sport-Ankündigungskanal ${channelId} nicht abrufbar - Meilenstein-Meldung(en) werden verworfen.`);
                return;
            }

            const reached = await sportService.checkAndMarkReachedMilestones();
            for (const milestone of reached) {
                try {
                    await channel.send(milestone.text);
                } catch (error) {
                    console.error(`Fehler beim Posten des Sport-Meilensteins (${milestone.kilometers} km):`, error);
                }
            }
        } catch (error) {
            console.error('Fehler beim Prüfen/Posten der Sport-Meilensteine:', error);
        }
    }
}

export default new SportHandler();
