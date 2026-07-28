import {describe, it, expect, vi, beforeEach} from 'vitest';
import {MessageFlags} from 'discord.js';

const rpService = vi.hoisted(() => ({
    setSuchend: vi.fn(),
    entferneSuchend: vi.fn(),
    getSuchende: vi.fn(),
    istSuchend: vi.fn(),
}));
vi.mock('../services/rp.service.js', () => ({default: rpService}));

import rpHandler, {formatArt} from './rp.handler.js';

const mockInteraction = (art?: string) => ({
    user: {id: 'u1'},
    options: {getString: vi.fn().mockReturnValue(art)},
    reply: vi.fn(),
} as any);

describe('formatArt', () => {
    it('übersetzt die internen Werte in lesbare Beschriftungen', () => {
        expect(formatArt('pbp')).toBe('PbP');
        expect(formatArt('live')).toBe('Live');
        expect(formatArt('beides')).toBe('PbP & Live');
    });
});

describe('RpHandler', () => {
    beforeEach(() => {
        rpService.setSuchend.mockReset();
        rpService.entferneSuchend.mockReset();
        rpService.getSuchende.mockReset();
        rpService.istSuchend.mockReset();
    });

    describe('handleSuche', () => {
        it('trägt die Person mit der gewählten Art ein und antwortet ephemer', async () => {
            const interaction = mockInteraction('pbp');

            await rpHandler.handleSuche(interaction);

            expect(rpService.setSuchend).toHaveBeenCalledWith('u1', 'pbp');
            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.flags).toBe(MessageFlags.Ephemeral);
            expect(reply.content).toContain('PbP');
        });
    });

    describe('handleBeenden', () => {
        it('entfernt eine eingetragene Person', async () => {
            rpService.istSuchend.mockResolvedValue(true);
            const interaction = mockInteraction();

            await rpHandler.handleBeenden(interaction);

            expect(rpService.entferneSuchend).toHaveBeenCalledWith('u1');
            expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
        });

        it('meldet, wenn die Person gar nicht eingetragen war, und entfernt nichts', async () => {
            rpService.istSuchend.mockResolvedValue(false);
            const interaction = mockInteraction();

            await rpHandler.handleBeenden(interaction);

            expect(rpService.entferneSuchend).not.toHaveBeenCalled();
            expect(interaction.reply.mock.calls[0][0].content).toContain('gar nicht');
        });
    });

    describe('handleSuchende', () => {
        it('listet alle Suchenden mit Art auf, ohne anzupingen', async () => {
            rpService.getSuchende.mockResolvedValue({u1: 'pbp', u2: 'beides'});
            const interaction = mockInteraction();

            await rpHandler.handleSuchende(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('<@u1> – PbP');
            expect(reply.content).toContain('<@u2> – PbP & Live');
            expect(reply.allowedMentions).toEqual({parse: []});
        });

        it('meldet, wenn niemand sucht', async () => {
            rpService.getSuchende.mockResolvedValue({});
            const interaction = mockInteraction();

            await rpHandler.handleSuchende(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('niemand'));
        });
    });
});
