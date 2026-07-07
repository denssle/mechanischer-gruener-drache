import {ChatInputCommandInteraction, Message, OmitPartialGroupDMChannel} from 'discord.js';
import blahajService from '../services/blahaj.service.js';

// Ein Blåhaj kostet aktuell 28 € und beansprucht ca. 0,00003 ha Fläche.
export const EURO_PER_BLAHAJ = 28;
export const HECTARES_PER_BLAHAJ = 0.00003;

// Wandelt einen deutsch geschriebenen Zahlen-String in eine Zahl. Faustregel (deutscher Server):
// Komma = Dezimaltrennzeichen, Punkt = Tausendertrennzeichen. Steht nur ein Punkt ohne Komma und
// gruppiert er sauber in 3er-Blöcken (z.B. 1.234), gilt er als Tausenderpunkt; sonst als Dezimalpunkt.
function normalizeGermanNumber(raw: string): number {
    const cleaned = raw.replace(/[.,]+$/, '');
    if (cleaned.includes(',')) {
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
        return parseFloat(cleaned.replace(/\./g, ''));
    }
    return parseFloat(cleaned);
}

// Zieht alle Euro-Beträge aus einem Text: erkennt "50€", "€50", "50 €", "50 Euro", "50 EUR"
// (jeweils optional mit Tausenderpunkten/Dezimalkomma). Exportiert + getestet.
export function parseEuroAmounts(text: string): number[] {
    const regex = /€\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:€|eur\b|euro\b)/gi;
    const amounts: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const raw = match[1] ?? match[2];
        const value = normalizeGermanNumber(raw);
        if (Number.isFinite(value) && value > 0) {
            amounts.push(value);
        }
    }
    return amounts;
}

function formatEuro(amount: number): string {
    return amount.toLocaleString('de-DE', {maximumFractionDigits: 2});
}

function formatHectares(hectares: number): string {
    return hectares.toLocaleString('de-DE', {maximumFractionDigits: 5});
}

function blahajWord(count: number): string {
    return count === 1 ? 'Blåhaj' : 'Blåhajs';
}

class BlahajHandler {
    // Auto-Listener: reagiert auf jede Nachricht mit Euro-Betrag. Bot-Nachrichten MÜSSEN ignoriert
    // werden, sonst würde die "28 €" in der eigenen Antwort eine Endlosschleife auslösen.
    async handleMessage(message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<void> {
        if (message.author.bot) return;

        const amounts = parseEuroAmounts(message.content);
        if (!amounts.length) return;

        const messageSum = amounts.reduce((sum, amount) => sum + amount, 0);
        const total = await blahajService.addEuroAmount(messageSum);

        const messageBlahaj = Math.floor(messageSum / EURO_PER_BLAHAJ);
        const totalBlahaj = Math.floor(total / EURO_PER_BLAHAJ);
        const area = totalBlahaj * HECTARES_PER_BLAHAJ;

        await message.reply(
            `🦈 Für ${formatEuro(messageSum)}€ gäbe es **${messageBlahaj}** ${blahajWord(messageBlahaj)}!\n` +
            `Insgesamt bedecken die Server-Blåhajs schon **${formatHectares(area)} ha** 🌍`
        );
    }

    // /blahaj: ohne Betrag die laufende Server-Gesamtsumme, mit Betrag ein reiner Rechner
    // (der übergebene Betrag zählt bewusst NICHT zur Gesamtsumme - das macht nur der Auto-Listener).
    async handleBlahaj(interaction: ChatInputCommandInteraction): Promise<unknown> {
        const betrag = interaction.options.getNumber('betrag', false);

        if (betrag !== null) {
            const blahaj = Math.floor(betrag / EURO_PER_BLAHAJ);
            return interaction.reply(
                `🦈 Für ${formatEuro(betrag)}€ gäbe es **${blahaj}** ${blahajWord(blahaj)}.`
            );
        }

        const total = await blahajService.getTotalEur();
        const totalBlahaj = Math.floor(total / EURO_PER_BLAHAJ);
        const area = totalBlahaj * HECTARES_PER_BLAHAJ;

        return interaction.reply(
            `🦈 **Blåhaj-Rechner**\n` +
            `Bisher wurden auf dem Server **${formatEuro(total)}€** erwähnt.\n` +
            `Das wären **${totalBlahaj}** ${blahajWord(totalBlahaj)} = **${formatHectares(area)} ha** Blåhaj-Fläche! 🌍`
        );
    }
}

export default new BlahajHandler();
