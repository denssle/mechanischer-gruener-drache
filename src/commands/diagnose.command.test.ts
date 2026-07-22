import { describe, it, expect, vi } from 'vitest';

vi.mock('../handlers/diagnose.handler.js', () => ({
    default: {
        handleDiagnose: vi.fn(),
    }
}));

import diagnoseHandler from '../handlers/diagnose.handler.js';
import diagnoseCommand from './diagnose.command.js';

describe('diagnose.command', () => {
    it('leitet execute an diagnoseHandler.handleDiagnose weiter', async () => {
        const interaction = {} as any;

        await diagnoseCommand.execute(interaction);

        expect(diagnoseHandler.handleDiagnose).toHaveBeenCalledWith(interaction);
    });
});
