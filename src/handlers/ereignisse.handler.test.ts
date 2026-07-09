import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/news.service.js', () => ({
    default: { getGameEvents: vi.fn() }
}));

import newsService from '../services/news.service.js';
import ereignisseHandler from './ereignisse.handler.js';

const mockInteraction = () => ({
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn(),
} as any);

const gameEvents = (events: string[]) => ({
    date: '09.07.2026', events, url: 'https://www.lotgd.de/news.php'
});

describe('EreignisseHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('defered und meldet einen Fehler wenn die Ereignisse nicht abrufbar sind', async () => {
        vi.mocked(newsService.getGameEvents).mockResolvedValue(null);
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('nicht abrufen'));
    });

    it('postet Datum, Ereignisse als Liste und den Link', async () => {
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['Zalia blamierte sich.', 'Treva wurde wiederbelebt.']));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply).toContain('Neuigkeiten am 09.07.2026');
        expect(reply).toContain('- Zalia blamierte sich.');
        expect(reply).toContain('- Treva wurde wiederbelebt.');
        expect(reply).toContain('lotgd.de/news.php');
    });

    it('zeigt höchstens 5 Ereignisse, auch wenn die Seite mehr liefert', async () => {
        const events = Array.from({ length: 50 }, (_, i) => `Ereignis ${i + 1}`);
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(events));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply).toContain('Ereignis 5');
        expect(reply).not.toContain('Ereignis 6');
    });

    it('lässt überzählige Ereignisse ganz weg statt Sätze abzuschneiden', async () => {
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['a'.repeat(1480), 'Dieses Ereignis passt nicht mehr.']));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply).toContain('a'.repeat(1480));
        expect(reply).not.toContain('Dieses Ereignis passt nicht mehr.');
        expect(reply.length).toBeLessThan(2000);
    });

    it('kürzt ein einzelnes überlanges Ereignis, statt eine leere Liste zu posten', async () => {
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['a'.repeat(3000)]));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply).toContain('…');
        expect(reply.length).toBeLessThan(2000);
    });
});
