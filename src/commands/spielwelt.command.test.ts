import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/spielwelt.handler.js', () => ({
    default: { handleSpielwelt: vi.fn() }
}));

import spielweltHandler from '../handlers/spielwelt.handler.js';
import spielweltCommand from './spielwelt.command.js';

describe('spielwelt.command', () => {
    it('leitet execute an spielweltHandler.handleSpielwelt weiter', async () => {
        const interaction = {} as any;

        await spielweltCommand.execute(interaction);

        expect(spielweltHandler.handleSpielwelt).toHaveBeenCalledWith(interaction);
    });
});
