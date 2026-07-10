import { describe, it, expect, vi } from 'vitest';
import spielweltHandler, { SPIELWELT_HELP } from './spielwelt.handler.js';

describe('SpielweltHandler', () => {
    it('antwortet mit der Spielwelt-Hilfe', async () => {
        const interaction = { reply: vi.fn() } as any;

        await spielweltHandler.handleSpielwelt(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(SPIELWELT_HELP);
    });

    it.each(['/news', '/ereignisse', '/online'])('erklärt den Befehl %s', (command) => {
        expect(SPIELWELT_HELP).toContain(command);
    });

    it('bleibt unter dem Discord-Limit von 2000 Zeichen', () => {
        expect(SPIELWELT_HELP.length).toBeLessThanOrEqual(2000);
    });
});
