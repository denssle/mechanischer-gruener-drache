import { describe, it, expect, vi } from 'vitest';

vi.mock('../../package.json', () => ({
    default: { version: '1.2.3' }
}));

import versionCommand from './version.command.js';

describe('version.command', () => {
    it('antwortet mit der aktuellen Version aus package.json', async () => {
        const interaction = { reply: vi.fn() } as any;

        await versionCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith('Aktuelle Version: 1.2.3');
    });
});
