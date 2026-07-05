import { describe, it, expect, vi } from 'vitest';
import hilfeHandler, { HELP_TEXT } from './hilfe.handler.js';

describe('HilfeHandler', () => {
    it('antwortet mit der Gesamt-Übersicht', async () => {
        const interaction = { reply: vi.fn() } as any;

        await hilfeHandler.handleHilfe(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(HELP_TEXT);
    });

    // Flache Einzelbefehle haben kein eigenes `hilfe` (siehe Design-Entscheidung) - sie werden
    // NUR hier erklärt. Dieser Test ist die Absicherung, dass keiner davon vergessen wird.
    it.each(['/pingpong', '/pingbestenliste', '/news', '/version', '/rollenbutton', '/protokoll'])(
        'erwähnt den flachen Befehl %s (der sonst nirgends dokumentiert ist)',
        (command) => {
            expect(HELP_TEXT).toContain(command);
        }
    );

    it('verweist für die Gruppen-Befehle auf deren eigenes hilfe', () => {
        expect(HELP_TEXT).toContain('/sport hilfe');
        expect(HELP_TEXT).toContain('/twitch hilfe');
        expect(HELP_TEXT).toContain('/event hilfe');
    });

    it('bleibt unter dem Discord-Limit von 2000 Zeichen', () => {
        expect(HELP_TEXT.length).toBeLessThanOrEqual(2000);
    });
});
