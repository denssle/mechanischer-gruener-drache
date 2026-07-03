import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/logging.handler.js', () => ({
    default: {
        handleSetChannel: vi.fn(),
    }
}));

import loggingHandler from '../handlers/logging.handler.js';
import logCommand from './log.command.js';

describe('log.command', () => {
    it('leitet execute an loggingHandler.handleSetChannel weiter', async () => {
        const interaction = {} as any;

        await logCommand.execute(interaction);

        expect(loggingHandler.handleSetChannel).toHaveBeenCalledWith(interaction);
    });
});
