import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/sport.service.js', () => ({
    default: {
        addEntry: vi.fn(),
        deleteEntry: vi.fn(),
        editEntry: vi.fn(),
        getUserEntries: vi.fn(),
        setKilometer: vi.fn(),
        getGesamtKilometer: vi.fn(),
        addLegacyKilometer: vi.fn(),
        getLegacyKilometer: vi.fn(),
        setLegacyKilometer: vi.fn(),
    }
}));

import sportService from '../services/sport.service.js';
import sportHandler, { EINTRAG_FLAVORS, randomEintragFlavor } from './sport.handler.js';

const mockEntry = (overrides = {}) => ({
    id: 'entry-1',
    userId: 'user-123',
    activity: 'laufen',
    kilometers: 10,
    createdAt: new Date().toISOString(),
    ...overrides,
});

describe('SportHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleEintragen', () => {
        it('speichert den Eintrag und bestätigt ihn als Embed mit User, Distanz und Gruppengesamt', async () => {
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(250);
            const interaction = {
                user: {
                    id: 'user-123',
                    displayName: 'Testläufer',
                    displayAvatarURL: vi.fn().mockReturnValue('https://cdn/avatar.png'),
                },
                options: {
                    getString: vi.fn().mockReturnValue('laufen'),
                    getNumber: vi.fn().mockReturnValue(10),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleEintragen(interaction);

            expect(sportService.addEntry).toHaveBeenCalledWith('user-123', 'laufen', 10);
            expect(sportService.getGesamtKilometer).toHaveBeenCalled();

            const embed = (interaction.reply as any).mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            // User findet sich per Name + Profilbild im Post wieder.
            expect(json.author.name).toBe('Testläufer');
            expect(json.author.icon_url).toBe('https://cdn/avatar.png');
            expect(json.description).toContain('10 km');
            expect(json.description).toContain('250 km');
            // Eintrags-ID bleibt sichtbar (für /sport loeschen bzw. bearbeiten).
            expect(json.footer.text).toContain('entry-1');
        });
    });

    describe('Eintrag-Flavor', () => {
        it('randomEintragFlavor liefert immer eine Zeile aus EINTRAG_FLAVORS', () => {
            for (let i = 0; i < 50; i++) {
                expect(EINTRAG_FLAVORS).toContain(randomEintragFlavor());
            }
        });
    });

    describe('handleLoeschen', () => {
        it('meldet wenn der Eintrag nicht gefunden wird', async () => {
            vi.mocked(sportService.deleteEntry).mockResolvedValue(false);
            const interaction = {
                user: { id: 'user-123' },
                options: { getString: vi.fn().mockReturnValue('entry-1') },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleLoeschen(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('nicht gefunden'));
        });

        it('bestätigt das Löschen bei Erfolg', async () => {
            vi.mocked(sportService.deleteEntry).mockResolvedValue(true);
            const interaction = {
                user: { id: 'user-123' },
                options: { getString: vi.fn().mockReturnValue('entry-1') },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleLoeschen(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('erfolgreich gelöscht'));
        });
    });

    describe('handleBearbeiten', () => {
        it('meldet wenn der Eintrag nicht gefunden wird', async () => {
            vi.mocked(sportService.editEntry).mockResolvedValue(null);
            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getString: vi.fn().mockReturnValue('entry-1'),
                    getNumber: vi.fn().mockReturnValue(15),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('nicht gefunden'));
        });

        it('bestätigt die Aktualisierung bei Erfolg', async () => {
            vi.mocked(sportService.editEntry).mockResolvedValue(mockEntry({ kilometers: 15 }));
            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getString: vi.fn().mockReturnValue('entry-1'),
                    getNumber: vi.fn().mockReturnValue(15),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('15 km'));
        });
    });

    describe('handleStatistik', () => {
        it('meldet wenn der User noch keine Einträge hat', async () => {
            vi.mocked(sportService.getUserEntries).mockResolvedValue([]);
            const interaction = { user: { id: 'user-123' }, reply: vi.fn() } as any;

            await sportHandler.handleStatistik(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('noch keine Einträge'));
        });

        it('gruppiert und summiert die Einträge pro Aktivität', async () => {
            vi.mocked(sportService.getUserEntries).mockResolvedValue([
                mockEntry({ activity: 'laufen', kilometers: 10 }),
                mockEntry({ activity: 'laufen', kilometers: 5 }),
                mockEntry({ activity: 'radfahren', kilometers: 20 }),
            ]);
            const interaction = { user: { id: 'user-123' }, reply: vi.fn() } as any;

            await sportHandler.handleStatistik(interaction);

            const reply = (interaction.reply as any).mock.calls[0][0] as string;
            expect(reply).toContain('Laufen – 15 km');
            expect(reply).toContain('Radfahren – 20 km');
            expect(reply).toContain('Gesamt: **35 km**');
        });
    });

    describe('handleSetzen', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: {
                getUser: vi.fn().mockReturnValue({ id: 'target-user' }),
                getNumber: vi.fn().mockReturnValue(42),
            },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await sportHandler.handleSetzen(interaction);

            expect(sportService.setKilometer).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('setzt den Kilometerstand mit Administrator-Rechten', async () => {
            const interaction = mockInteraction(true);

            await sportHandler.handleSetzen(interaction);

            expect(sportService.setKilometer).toHaveBeenCalledWith('target-user', 42);
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('42 km'));
        });
    });

    describe('handleGesamt', () => {
        it('zeigt die Gesamtkilometer an', async () => {
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(123);
            const interaction = { reply: vi.fn() } as any;

            await sportHandler.handleGesamt(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('123 km'));
        });
    });

    describe('handleAltkilometer', () => {
        const mockInteraction = (isAdmin: boolean) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getNumber: vi.fn().mockReturnValue(50) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await sportHandler.handleAltkilometer(interaction);

            expect(sportService.addLegacyKilometer).not.toHaveBeenCalled();
        });

        it('speist die Altdaten mit Administrator-Rechten ein', async () => {
            const interaction = mockInteraction(true);

            await sportHandler.handleAltkilometer(interaction);

            expect(sportService.addLegacyKilometer).toHaveBeenCalledWith(50);
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('50 km'));
        });
    });

    describe('handleAltkilometerSetzen', () => {
        const mockInteraction = (isAdmin: boolean, kilometer = 200) => ({
            memberPermissions: { has: vi.fn().mockReturnValue(isAdmin) },
            options: { getNumber: vi.fn().mockReturnValue(kilometer) },
            reply: vi.fn(),
        } as any);

        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction(false);

            await sportHandler.handleAltkilometerSetzen(interaction);

            expect(sportService.setLegacyKilometer).not.toHaveBeenCalled();
        });

        it('setzt die Bestandskilometer und nennt den vorherigen Wert', async () => {
            vi.mocked(sportService.getLegacyKilometer).mockResolvedValue(120);
            const interaction = mockInteraction(true, 200);

            await sportHandler.handleAltkilometerSetzen(interaction);

            expect(sportService.setLegacyKilometer).toHaveBeenCalledWith(200);
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('200 km'));
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('120 km'));
        });

        it('meldet das Entfernen wenn auf 0 gesetzt wird', async () => {
            vi.mocked(sportService.getLegacyKilometer).mockResolvedValue(80);
            const interaction = mockInteraction(true, 0);

            await sportHandler.handleAltkilometerSetzen(interaction);

            expect(sportService.setLegacyKilometer).toHaveBeenCalledWith(0);
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('entfernt'));
        });
    });
});
