import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/news.service.js', () => ({
    default: { getGameEvents: vi.fn() }
}));

// Nur Redis wegmocken - die Match-Logik von character.service soll echt laufen.
vi.mock('../services/redis.service.js', () => ({
    default: { get: vi.fn(), getList: vi.fn() }
}));

import newsService from '../services/news.service.js';
import characterService from '../services/character.service.js';
import ereignisseHandler from './ereignisse.handler.js';

const getAllLinks = vi.spyOn(characterService, 'getAllLinks');

const mockInteraction = () => ({
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn(),
} as any);

const gameEvents = (events: string[]) => ({
    date: '09.07.2026', events, url: 'https://www.lotgd.de/news.php'
});

// Ab dem Verknüpfungs-Abgleich antwortet der Handler mit {content, allowedMentions}.
const content = (interaction: any) => interaction.editReply.mock.calls[0][0].content as string;

describe('EreignisseHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        getAllLinks.mockResolvedValue([]);
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

        const reply = content(interaction);
        expect(reply).toContain('Neuigkeiten am 09.07.2026');
        expect(reply).toContain('- Zalia blamierte sich.');
        expect(reply).toContain('- Treva wurde wiederbelebt.');
        expect(reply).toContain('lotgd.de/news.php');
    });

    it('hebt einen verknüpften Charakter hervor und nennt seinen Discord-User', async () => {
        getAllLinks.mockResolvedValue([{ discordUserId: '42', name: 'Zalia' }]);
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['Zalia blamierte sich.', 'Treva wurde wiederbelebt.']));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = content(interaction);
        expect(reply).toContain('- **Zalia** blamierte sich. (<@42>)');
        expect(reply).toContain('- Treva wurde wiederbelebt.');
    });

    it('pingt niemanden an', async () => {
        getAllLinks.mockResolvedValue([{ discordUserId: '42', name: 'Zalia' }]);
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['Zalia blamierte sich.']));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        expect(interaction.editReply.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
    });

    it('postet die Ereignisse auch dann, wenn die Verknüpfungen nicht ladbar sind', async () => {
        getAllLinks.mockRejectedValue(new Error('Redis weg'));
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['Zalia blamierte sich.']));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        expect(content(interaction)).toContain('- Zalia blamierte sich.');
    });

    it('zeigt höchstens 5 Ereignisse, auch wenn die Seite mehr liefert', async () => {
        const events = Array.from({ length: 50 }, (_, i) => `Ereignis ${i + 1}`);
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(events));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = content(interaction);
        expect(reply).toContain('Ereignis 5');
        expect(reply).not.toContain('Ereignis 6');
    });

    it('lässt überzählige Ereignisse ganz weg statt Sätze abzuschneiden', async () => {
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['a'.repeat(1480), 'Dieses Ereignis passt nicht mehr.']));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = content(interaction);
        expect(reply).toContain('a'.repeat(1480));
        expect(reply).not.toContain('Dieses Ereignis passt nicht mehr.');
        expect(reply.length).toBeLessThan(2000);
    });

    it('kürzt ein einzelnes überlanges Ereignis, statt eine leere Liste zu posten', async () => {
        vi.mocked(newsService.getGameEvents).mockResolvedValue(gameEvents(['a'.repeat(3000)]));
        const interaction = mockInteraction();

        await ereignisseHandler.handleEreignisse(interaction);

        const reply = content(interaction);
        expect(reply).toContain('…');
        expect(reply.length).toBeLessThan(2000);
    });
});
