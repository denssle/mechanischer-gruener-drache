import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOnline = vi.fn();
vi.mock('../services/online.service.js', () => ({
    default: { getOnline: (...args: unknown[]) => getOnline(...args) },
}));

// Nur Redis wegmocken - die Match-Logik von character.service soll echt laufen.
vi.mock('../services/redis.service.js', () => ({
    default: { get: vi.fn(), getList: vi.fn() },
}));

import characterService from '../services/character.service.js';
import onlineHandler from './online.handler.js';

const getAllLinks = vi.spyOn(characterService, 'getAllLinks');

function makeInteraction() {
    return { deferReply: vi.fn(), editReply: vi.fn() } as any;
}

// Ab dem Verknüpfungs-Abgleich antwortet der Handler mit {content, allowedMentions}.
const content = (interaction: any) => interaction.editReply.mock.calls[0][0].content as string;

describe('OnlineHandler', () => {
    beforeEach(() => {
        getOnline.mockReset();
        getAllLinks.mockReset();
        getAllLinks.mockResolvedValue([]);
    });

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

        const reply = content(interaction);
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

        expect(content(interaction)).toContain('Outremer — Stufe 12 Mensch, in Romar (tot)');
    });

    it('hebt verknüpfte Charaktere hervor - auch mit Titel-Präfix im Spielnamen', async () => {
        getAllLinks.mockResolvedValue([{ discordUserId: '42', name: 'Acaine' }]);
        getOnline.mockResolvedValue({
            players: [
                { gilde: '', name: 'Centurio Acaine', ort: 'Romar', level: '9', rasse: 'Elf', lebt: true },
                { gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true },
            ],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
        expect(reply).toContain('**Centurio Acaine** (<@42>)');
        expect(reply).toContain('Cvetanka — Stufe 14');
        // Niemand soll von einem /online angepingt werden.
        expect(interaction.editReply.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
    });

    it('hebt verknüpfte Charaktere auch in der 30-Minuten-Zeile hervor', async () => {
        getAllLinks.mockResolvedValue([{ discordUserId: '42', name: 'Xara' }]);
        getOnline.mockResolvedValue({ players: [], recent: ['Xara'] });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(content(interaction)).toContain('**Xara** (<@42>)');
    });

    it('zeigt die Liste auch dann, wenn die Verknüpfungen nicht ladbar sind', async () => {
        getAllLinks.mockRejectedValue(new Error('Redis weg'));
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true }],
            recent: [],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        expect(content(interaction)).toContain('Cvetanka — Stufe 14 Echse, in Glorfindal');
    });

    it('hängt 30-Minuten-Namen an, aber nur die nicht ohnehin Eingeloggten', async () => {
        getOnline.mockResolvedValue({
            players: [{ gilde: '', name: 'Cvetanka', ort: 'Glorfindal', level: '14', rasse: 'Echse', lebt: true }],
            recent: ['Cvetanka', 'Xara'],
        });
        const interaction = makeInteraction();

        await onlineHandler.handleOnline(interaction);

        const reply = content(interaction);
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
