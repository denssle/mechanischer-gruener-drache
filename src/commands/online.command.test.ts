import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/online.handler.js', () => ({
    default: { handleOnline: vi.fn() }
}));

import onlineHandler from '../handlers/online.handler.js';
import onlineCommand from './online.command.js';

describe('online.command', () => {
    it('leitet execute an onlineHandler.handleOnline weiter', async () => {
        const interaction = {} as any;

        await onlineCommand.execute(interaction);

        expect(onlineHandler.handleOnline).toHaveBeenCalledWith(interaction);
    });
});
