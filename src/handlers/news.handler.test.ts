import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/news.service.js', () => ({
    default: { getLatestNews: vi.fn() }
}));

import newsService from '../services/news.service.js';
import newsHandler from './news.handler.js';

const mockInteraction = () => ({
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn(),
} as any);

describe('NewsHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('defered und meldet einen Fehler wenn keine News abrufbar sind', async () => {
        vi.mocked(newsService.getLatestNews).mockResolvedValue(null);
        const interaction = mockInteraction();

        await newsHandler.handleNews(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('nicht abrufen'));
    });

    it('postet Titel, Datum, Text und Link', async () => {
        vi.mocked(newsService.getLatestNews).mockResolvedValue({
            title: 'Serverplot', date: '19.04.2026 08:46', text: 'Ein Gesuch.', url: 'https://www.lotgd.de/news.php'
        });
        const interaction = mockInteraction();

        await newsHandler.handleNews(interaction);

        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply).toContain('Serverplot');
        expect(reply).toContain('19.04.2026 08:46');
        expect(reply).toContain('Ein Gesuch.');
        expect(reply).toContain('lotgd.de/news.php');
    });

    it('kürzt sehr langen Text und bleibt unter dem Discord-Limit', async () => {
        vi.mocked(newsService.getLatestNews).mockResolvedValue({
            title: 'T', date: 'D', text: 'a'.repeat(3000), url: 'https://www.lotgd.de/news.php'
        });
        const interaction = mockInteraction();

        await newsHandler.handleNews(interaction);

        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply).toContain('…');
        expect(reply.length).toBeLessThan(2000);
    });
});
