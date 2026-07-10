import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOnline = vi.fn();
vi.mock('../services/online.service.js', () => ({
    default: { getOnline: (...args: unknown[]) => getOnline(...args) },
}));

import onlineHandler from './online.handler.js';

function makeInteraction() {
    return { deferReply: vi.fn(), editReply: vi.fn() } as any;
}

describe('OnlineHandler', () => {
    beforeEach(() => getOnline.mockReset());

    it('formatiert die eingeloggten Spieler mit Stufe, Rasse und Ort', async () => {
        getOnline.mockResolvedValue({
            players: [
                { gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true },
                { gilde: '<CdF>', name: 'Danjun', ort: 'Romar', level: '11', rasse: 'Mensch', lebt: true },
            ],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = interaction.editReply.mock.calls[0][0] as string;
        expect(reply).toContain('Gerade im Wyrmland unterwegs (2):');
        expect(reply).toContain('Cvetanka — Stufe 14 Echse, in Glorfindal');
        expect(reply).toContain('<CdF> Danjun — Stufe 11 Mensch, in Romar');
    });

    it('markiert tote Charaktere mit (tot)', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Outremer', ort: 'Romar', level: '12', rasse: 'Mensch', lebt: false }],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(interaction.editReply.mock.calls[0][0]).toContain('Outremer — Stufe 12 Mensch, in Romar (tot)');
    });

    it('hängt 30-Minuten-Namen an, aber nur die nicht ohnehin Eingeloggten', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true }],
            recent: ['Cvetanka', 'Xara'],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = interaction.editReply.mock.calls[0][0] as string;
        expect(reply).toContain('Auch in den letzten 30 Minuten aktiv:');
        expect(reply).toContain('Xara');
        // Cvetanka steht schon oben als eingeloggt - nicht doppelt in der 30-Min-Zeile.
        expect(reply.match(/Cvetanka/g)).toHaveLength(1);
    });

    it('meldet, wenn niemand eingeloggt ist', async () => {
        getOnline.mockResolvedValue({ players: [], recent: [] });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith('Gerade ist niemand im Wyrmland eingeloggt.');
    });

    it('meldet einen Abruf-Fehler, statt zu crashen', async () => {
        getOnline.mockResolvedValue(null);
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(
            'Konnte die Kriegerliste gerade nicht abrufen. Versuch es später nochmal.'
        );
    });
});
