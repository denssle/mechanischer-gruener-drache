import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/news.handler.js', () => ({
    default: { handleNews: vi.fn() }
}));

import newsHandler from '../handlers/news.handler.js';
import newsCommand from './news.command.js';

describe('news.command', () => {
    it('leitet execute an newsHandler.handleNews weiter', async () => {
        const interaction = {} as any;

        await newsCommand.execute(interaction);

        expect(newsHandler.handleNews).toHaveBeenCalledWith(interaction);
    });
});
