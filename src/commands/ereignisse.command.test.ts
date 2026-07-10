import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/ereignisse.handler.js', () => ({
    default: { handleEreignisse: vi.fn() }
}));

import ereignisseHandler from '../handlers/ereignisse.handler.js';
import ereignisseCommand from './ereignisse.command.js';

describe('ereignisse.command', () => {
    it('leitet execute an ereignisseHandler.handleEreignisse weiter', async () => {
        const interaction = {} as any;

        await ereignisseCommand.execute(interaction);

        expect(ereignisseHandler.handleEreignisse).toHaveBeenCalledWith(interaction);
    });
});
