import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../handlers/blahaj.handler.js', () => ({
    default: {
        handleBlahaj: vi.fn(),
    }
}));

import blahajHandler from '../handlers/blahaj.handler.js';
import blahajCommand from './blahaj.command.js';

describe('blahaj.command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('heißt blahaj und hat eine optionale betrag-Option', () => {
        const json = blahajCommand.data.toJSON();
        expect(json.name).toBe('blahaj');
        expect(json.options?.[0]?.name).toBe('betrag');
        expect(json.options?.[0]?.required).toBeFalsy();
    });

    it('leitet execute an blahajHandler.handleBlahaj weiter', async () => {
        const interaction = {} as any;

        await blahajCommand.execute(interaction);

        expect(blahajHandler.handleBlahaj).toHaveBeenCalledWith(interaction);
    });
});
