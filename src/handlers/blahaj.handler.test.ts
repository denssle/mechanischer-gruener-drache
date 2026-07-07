import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/blahaj.service.js', () => ({
    default: {
        addEuroAmount: vi.fn(),
        getTotalEur: vi.fn(),
    }
}));

import blahajService from '../services/blahaj.service.js';
import blahajHandler, { parseEuroAmounts, EURO_PER_BLAHAJ } from './blahaj.handler.js';

describe('parseEuroAmounts', () => {
    it.each([
        ['60€', [60]],
        ['€60', [60]],
        ['Das kostet 50 €', [50]],
        ['50 Euro', [50]],
        ['50 EUR', [50]],
        ['2,50€', [2.5]],
        ['1.234,56 €', [1234.56]],
        ['4.280€', [4280]],       // Tausenderpunkt
        ['1.50 €', [1.5]],        // kein 3er-Block -> Dezimalpunkt
        ['100€ und nochmal 50€', [100, 50]],
    ])('erkennt %s korrekt', (text, expected) => {
        expect(parseEuroAmounts(text)).toEqual(expected);
    });

    it.each([
        'nichts mit Geld',
        'Jahr 2024',
        'Zimmer 50',
    ])('findet keinen Betrag in "%s"', (text) => {
        expect(parseEuroAmounts(text)).toEqual([]);
    });
});

describe('BlahajHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleMessage', () => {
        const mockMessage = (content: string, isBot = false) => ({
            author: { bot: isBot },
            content,
            reply: vi.fn(),
        } as any);

        it('ignoriert Bot-Nachrichten (verhindert Endlosschleife)', async () => {
            const message = mockMessage('Ein Blåhaj kostet 28€', true);

            await blahajHandler.handleMessage(message);

            expect(blahajService.addEuroAmount).not.toHaveBeenCalled();
            expect(message.reply).not.toHaveBeenCalled();
        });

        it('reagiert nicht auf Nachrichten ohne Euro-Betrag', async () => {
            const message = mockMessage('Hallo zusammen');

            await blahajHandler.handleMessage(message);

            expect(blahajService.addEuroAmount).not.toHaveBeenCalled();
            expect(message.reply).not.toHaveBeenCalled();
        });

        it('addiert die Summe zur Gesamtsumme und antwortet knapp nur mit der Blåhaj-Zahl', async () => {
            vi.mocked(blahajService.addEuroAmount).mockResolvedValue(4280);
            const message = mockMessage('Das Ticket kostet 60€');

            await blahajHandler.handleMessage(message);

            expect(blahajService.addEuroAmount).toHaveBeenCalledWith(60);
            const reply = (message.reply as any).mock.calls[0][0] as string;
            expect(reply).toContain('Blåhaj');
            expect(reply).toContain('2'); // 60 / 28 = 2 Blåhajs für diese Nachricht
            // Gesamtfläche/-summe steht bewusst nicht mehr in der Auto-Antwort.
            expect(reply).not.toContain('Insgesamt');
        });

        it('summiert mehrere Beträge einer Nachricht', async () => {
            vi.mocked(blahajService.addEuroAmount).mockResolvedValue(150);
            const message = mockMessage('100€ hier und 50€ da');

            await blahajHandler.handleMessage(message);

            expect(blahajService.addEuroAmount).toHaveBeenCalledWith(150);
        });
    });

    describe('handleBlahaj', () => {
        it('rechnet einen übergebenen Betrag um, ohne ihn zur Gesamtsumme zu zählen', async () => {
            const interaction = {
                options: { getNumber: vi.fn().mockReturnValue(60) },
                reply: vi.fn(),
            } as any;

            await blahajHandler.handleBlahaj(interaction);

            expect(blahajService.addEuroAmount).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('2')); // 60/28 = 2
        });

        it('zeigt ohne Betrag die Server-Gesamtsumme und Fläche', async () => {
            vi.mocked(blahajService.getTotalEur).mockResolvedValue(4280);
            const interaction = {
                options: { getNumber: vi.fn().mockReturnValue(null) },
                reply: vi.fn(),
            } as any;

            await blahajHandler.handleBlahaj(interaction);

            const reply = (interaction.reply as any).mock.calls[0][0] as string;
            expect(reply).toContain('152'); // 4280 / 28 = 152 Blåhajs
            expect(reply).toContain('ha');
        });
    });

    it('EURO_PER_BLAHAJ ist 28', () => {
        expect(EURO_PER_BLAHAJ).toBe(28);
    });
});
