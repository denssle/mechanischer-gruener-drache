import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/hilfe.handler.js', () => ({
    default: { handleHilfe: vi.fn() }
}));

import hilfeHandler from '../handlers/hilfe.handler.js';
import hilfeCommand from './hilfe.command.js';

describe('hilfe.command', () => {
    it('leitet execute an hilfeHandler.handleHilfe weiter', async () => {
        const interaction = {} as any;

        await hilfeCommand.execute(interaction);

        expect(hilfeHandler.handleHilfe).toHaveBeenCalledWith(interaction);
    });
});
