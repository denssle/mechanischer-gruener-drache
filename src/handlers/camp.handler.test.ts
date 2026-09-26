import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../services/camp.service.js', () => ({
    default: {
        pruefeCampFortschrittSeitStart: vi.fn(),
        getCampFortschrittSeitStart: vi.fn(),
        getCampStartDate: vi.fn(),
        initialisiereCamp: vi.fn(),
        setCurrentLevel: vi.fn(),
    },
}));

vi.mock('../services/sport.service.js', () => ({
    default: {
        getAnnouncementChannel: vi.fn(),
    },
}));

vi.mock('../client.js', () => ({
    default: {
        channels: {
            fetch: vi.fn(),
        },
    },
}));

import campService from '../services/camp.service.js';
import campHandler from './camp.handler.js';
import sportService from '../services/sport.service.js';
import client from '../client.js';

describe('CampHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('zeigt die aktuellen und insgesamt gesammelten Camp-Ressourcen an', async () => {
        vi.mocked(campService.getCampFortschrittSeitStart)
            .mockResolvedValue({
                aktuell: {
                    baumaterial: 7.5,
                    vorraete: 15,
                },
                insgesamt: {
                    baumaterial: 22.5,
                    vorraete: 95,
                },
                naechsteStufe: {
                    phase: 1,
                    stufe: 2,
                    name: 'Feuerstelle & Vorratsplatz',
                    kosten: {
                        baumaterial: 20,
                        vorraete: 85,
                    },
                },
            });

        const reply = vi.fn();

        const interaction = {
            reply,
        } as any;

        await campHandler.handleRessourcen(interaction);

        expect(campService.getCampFortschrittSeitStart)
            .toHaveBeenCalledOnce();

        expect(reply).toHaveBeenCalledOnce();

        const antwort = reply.mock.calls[0][0];

        expect(antwort).toContain('7.5/20 BM');
        expect(antwort).toContain('15/85 Vorräte');
        expect(antwort).toContain('22.5 BM');
        expect(antwort).toContain('95 Vorräte');
        expect(antwort).toContain('Feuerstelle & Vorratsplatz');
    });

    it('prüft den Camp-Fortschritt seit dem Staffelstart', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([]);

        await campHandler.pruefeFortschritt();

        expect(campService.pruefeCampFortschrittSeitStart)
            .toHaveBeenCalledOnce();
    });

    it('meldet, wenn das Camp noch nicht gestartet wurde', async () => {
        vi.mocked(campService.getCampFortschrittSeitStart)
            .mockResolvedValue(null);

        const reply = vi.fn();

        const interaction = {
            reply,
        } as any;

        await campHandler.handleRessourcen(interaction);

        expect(reply).toHaveBeenCalledWith(
            'Das Camp wurde noch nicht gestartet.'
        );
    });

    it('lehnt das Starten ohne Administrator-Rechte ab', async () => {
        const reply = vi.fn();

        const interaction = {
            memberPermissions: {
                has: vi.fn().mockReturnValue(false),
            },
            reply,
        } as any;

        await campHandler.handleStarten(interaction);

        expect(reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'Du benötigst Administrator-Rechte für diesen Befehl.',
            })
        );

        expect(campService.initialisiereCamp).not.toHaveBeenCalled();
    });

    it('startet das Camp als Administrator', async () => {
        const reply = vi.fn();

        vi.mocked(campService.getCampStartDate)
            .mockResolvedValue(null);

        const interaction = {
            memberPermissions: {
                has: vi.fn().mockReturnValue(true),
            },
            reply,
        } as any;

        await campHandler.handleStarten(interaction);

        expect(campService.initialisiereCamp)
            .toHaveBeenCalledWith(expect.any(Date));

        expect(reply).toHaveBeenCalledOnce();
    });

    it('überschreibt den vorhandenen Camp-Start nicht', async () => {
        const reply = vi.fn();

        vi.mocked(campService.getCampStartDate)
            .mockResolvedValue(new Date('2026-09-19T00:00:00.000Z'));

        const interaction = {
            memberPermissions: {
                has: vi.fn().mockReturnValue(true),
            },
            reply,
        } as any;

        await campHandler.handleStarten(interaction);

        expect(campService.initialisiereCamp)
            .not.toHaveBeenCalled();

        expect(reply).toHaveBeenCalledOnce();
    });

    it('zeigt die Hilfe für die Camp-Befehle an', async () => {
        const reply = vi.fn();

        const interaction = {
            reply,
        } as any;

        await campHandler.handleHilfe(interaction);

        expect(reply).toHaveBeenCalledOnce();

        const antwort = reply.mock.calls[0][0];

        expect(antwort).toContain('/camp ressourcen');
        expect(antwort).toContain('/camp hilfe');
    });

    it('ruft keinen Ankündigungskanal ab, wenn keine neue Camp-Stufe erreicht wurde', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([]);

        await campHandler.pruefeFortschritt();

        expect(sportService.getAnnouncementChannel).not.toHaveBeenCalled();
    });

    it('kündigt eine neu erreichte Camp-Stufe im Sportkanal an', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                },
            ]);

        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue('chan-1');

        const send = vi.fn();
        vi.mocked(client.channels.fetch)
            .mockResolvedValue({send} as any);

        await campHandler.pruefeFortschritt();

        expect(sportService.getAnnouncementChannel)
            .toHaveBeenCalledOnce();

        expect(client.channels.fetch)
            .toHaveBeenCalledWith('chan-1');

        expect(send)
            .toHaveBeenCalledOnce();

        expect(campService.setCurrentLevel)
            .toHaveBeenCalledWith(1);
    });

    it('kündigt mehrere neu erreichte Camp-Stufen an', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                },
                {
                    phase: 1,
                    stufe: 2,
                    name: 'Feuerstelle & Vorratsplatz',
                    kosten: {
                        baumaterial: 20,
                        vorraete: 85,
                    },
                },
            ]);

        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue('chan-1');

        const send = vi.fn();
        vi.mocked(client.channels.fetch)
            .mockResolvedValue({send} as any);

        await campHandler.pruefeFortschritt();

        expect(send).toHaveBeenCalledTimes(2);
        expect(campService.setCurrentLevel).toHaveBeenNthCalledWith(1, 1);
        expect(campService.setCurrentLevel).toHaveBeenNthCalledWith(2, 2);
    });

    it('bricht ohne Fehler ab, wenn der Ankündigungskanal nicht abrufbar ist', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                },
            ]);

        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue('chan-1');

        vi.mocked(client.channels.fetch)
            .mockRejectedValue(new Error('Kanal nicht erreichbar'));

        await expect(
            campHandler.pruefeFortschritt()
        ).resolves.toBeUndefined();
    });

    it('speichert die Camp-Stufe nicht, wenn die Ankündigung fehlschlägt', async () => {
        vi.mocked(campService.pruefeCampFortschrittSeitStart)
            .mockResolvedValue([
                {
                    phase: 1,
                    stufe: 1,
                    name: 'Bewohnbares Lager',
                    kosten: {
                        baumaterial: 15,
                        vorraete: 80,
                    },
                },
            ]);

        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue('chan-1');

        const send = vi.fn().mockRejectedValue(new Error('Discord-Fehler'));

        vi.mocked(client.channels.fetch)
            .mockResolvedValue({send} as any);

        await expect(campHandler.pruefeFortschritt())
            .rejects.toThrow('Discord-Fehler');

        expect(campService.setCurrentLevel)
            .not.toHaveBeenCalled();
    });
});