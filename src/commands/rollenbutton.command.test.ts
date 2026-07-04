import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/buttonRole.handler.js', () => ({
    default: {
        handleCreate: vi.fn(),
    }
}));

import buttonRoleHandler from '../handlers/buttonRole.handler.js';
import rollenbuttonCommand from './rollenbutton.command.js';

describe('rollenbutton.command', () => {
    it('leitet execute an buttonRoleHandler.handleCreate weiter', async () => {
        const interaction = {} as any;

        await rollenbuttonCommand.execute(interaction);

        expect(buttonRoleHandler.handleCreate).toHaveBeenCalledWith(interaction);
    });
});
