import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/pingPong.handler.js', () => ({
    default: { handlePingPong: vi.fn(), handlePingPongHighscore: vi.fn() }
}));

import pingPongHandler from '../handlers/pingPong.handler.js';
import pingHighscoreCommand from './pingHighscore.command.js';

describe('pingHighscore.command', () => {
    it('leitet execute an pingPongHandler.handlePingPongHighscore weiter', async () => {
        const interaction = {} as any;

        await pingHighscoreCommand.execute(interaction);

        expect(pingPongHandler.handlePingPongHighscore).toHaveBeenCalledWith(interaction);
    });
});
