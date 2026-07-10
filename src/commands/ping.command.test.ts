import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/pingPong.handler.js', () => ({
    default: { handlePingPong: vi.fn(), handlePingPongHighscore: vi.fn() }
}));

import pingPongHandler from '../handlers/pingPong.handler.js';
import pingCommand from './ping.command.js';

describe('ping.command', () => {
    it('leitet execute an pingPongHandler.handlePingPong weiter', async () => {
        const interaction = {} as any;

        await pingCommand.execute(interaction);

        expect(pingPongHandler.handlePingPong).toHaveBeenCalledWith(interaction);
    });
});
