import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags } from 'discord.js';

vi.mock('../services/sport.service.js', () => ({
    default: {
        addEntry: vi.fn(),
        deleteEntry: vi.fn(),
        editEntry: vi.fn(),
        editLastEntry: vi.fn(),
        deleteLastEntry: vi.fn(),
        getUserEntries: vi.fn(),
        setKilometer: vi.fn(),
        getGesamtKilometer: vi.fn(),
        addLegacyKilometer: vi.fn(),
        getLegacyKilometer: vi.fn(),
        setLegacyKilometer: vi.fn(),
        setMilestone: vi.fn(),
        getMilestones: vi.fn(),
        removeMilestone: vi.fn(),
        checkAndMarkReachedMilestones: vi.fn().mockResolvedValue([]),
        getAnnouncementChannel: vi.fn().mockResolvedValue(null),
        setAnnouncementChannel: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {
        channels: {
            fetch: vi.fn(),
        }
    }
}));

import sportService from '../services/sport.service.js';
import client from '../client.js';
import sportHandler, { parseKilometer, erkenneAktivitaet, DEFAULT_AKTIVITAET, BESTAETIGUNGS_REAKTION } from './sport.handler.js';

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
            // Kein Eintrags-ID-Footer mehr: loeschen/bearbeiten nehmen immer den letzten Eintrag.
            expect(json.footer).toBeUndefined();
        });

        // User-Wunsch: die Bestätigung sieht nur, wer eingetragen hat.
        it('antwortet ephemer', async () => {
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

            expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
        });
    });

    describe('parseKilometer', () => {
        it.each([
            ['+12 km gelaufen', 12],
            ['+12km', 12],
            ['heute +12,5 km geradelt', 12.5],
            ['+ 12.5 km', 12.5],
            ['ich bin +7 Kilometer gewandert', 7],
        ])('erkennt %s als %s km', (text, erwartet) => {
            expect(parseKilometer(text)).toBe(erwartet);
        });

        it.each([
            ['Nachricht ganz ohne Zahl'],
            ['ich habe +12 Punkte'],
            ['+0 km'],
        ])('gibt null zurück für "%s"', (text) => {
            expect(parseKilometer(text)).toBeNull();
        });

        // Das "+" ist der bewusste Eintrags-Marker: ohne ihn wird gar nichts erfasst.
        it.each([
            ['12 km gelaufen'],
            ['die Strecke sind 12,5 Kilometer'],
        ])('gibt null zurück ohne "+" vor der Zahl: "%s"', (text) => {
            expect(parseKilometer(text)).toBeNull();
        });

        // Bewusst nur die erste Angabe (nicht wie beim Blåhaj-Rechner alle summiert):
        // eine doppelt gezählte Distanz würde die gemeinsame Gesamtstrecke dauerhaft verfälschen.
        it('nimmt nur die erste Kilometer-Angabe', () => {
            expect(parseKilometer('+5 km gelaufen und +7 km geradelt')).toBe(5);
        });
    });

    describe('erkenneAktivitaet', () => {
        it.each([
            ['12 km gelaufen', 'laufen'],
            ['12 km gerannt', 'laufen'],
            ['12 km mit dem Fahrrad', 'radfahren'],
            ['12 km geschwommen', 'schwimmen'],
            ['12 km gewandert', 'wandern'],
            ['12 km Ski', 'skifahren'],
        ])('erkennt in "%s" die Aktivität %s', (text, erwartet) => {
            expect(erkenneAktivitaet(text)).toBe(erwartet);
        });

        it('nimmt ohne Schlüsselwort die Standard-Aktivität', () => {
            expect(erkenneAktivitaet('heute 12 km geschafft')).toBe(DEFAULT_AKTIVITAET);
        });

        // "rad" steckt in "Grad", "gerad" in "gerade" - ohne Wortgrenze wäre beides Radfahren.
        it.each([
            ['12 km bei 30 Grad geschafft'],
            ['ich bin gerade 12 km unterwegs gewesen'],
        ])('verwechselt "%s" nicht mit Radfahren', (text) => {
            expect(erkenneAktivitaet(text)).toBe(DEFAULT_AKTIVITAET);
        });
    });

    describe('handleMessage (Auto-Erfassung im Sport-Kanal)', () => {
        const mockMessage = (content: string, overrides = {}) => ({
            author: { id: 'user-123', bot: false },
            channelId: 'sport-kanal',
            content,
            react: vi.fn(),
            ...overrides,
        }) as any;

        it('trägt eine km-Angabe im Sport-Kanal automatisch ein', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
            const message = mockMessage('heute +12 km geradelt');

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).toHaveBeenCalledWith('user-123', 'radfahren', 12);
        });

        // Quittiert wird nur per Reaktion: eine Antwort wäre ein Post im Kanal, den alle sehen,
        // und ephemer geht hier nicht (keine Interaction, kein Interaction-Token).
        it('bestätigt per Reaktion statt mit einer Antwort im Kanal', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
            const message = mockMessage('heute +12 km geradelt');

            await sportHandler.handleMessage(message);

            expect(message.react).toHaveBeenCalledWith(BESTAETIGUNGS_REAKTION);
        });

        // Ohne "+" ist die Angabe keine bewusste Eintrags-Geste, sondern nur Gerede über Kilometer.
        it('ignoriert km-Angaben ohne "+"', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            const message = mockMessage('bin heute 12 km gelaufen, war anstrengend');

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).not.toHaveBeenCalled();
            expect(message.react).not.toHaveBeenCalled();
        });

        // Sonst würde jedes beiläufige "noch 3 km bis zum Bahnhof" die Gesamtdistanz verfälschen.
        it('ignoriert Nachrichten außerhalb des Sport-Kanals', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            const message = mockMessage('+3 km bis zum Bahnhof', { channelId: 'anderer-kanal' });

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).not.toHaveBeenCalled();
            expect(message.react).not.toHaveBeenCalled();
        });

        it('ignoriert alles, solange kein Sport-Kanal konfiguriert ist', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue(null);

            await sportHandler.handleMessage(mockMessage('+12 km gelaufen'));

            expect(sportService.addEntry).not.toHaveBeenCalled();
        });

        // Ohne das würde die eigene Bestätigung ("12 km") den Listener endlos neu triggern.
        it('ignoriert Bot-Nachrichten', async () => {
            const message = mockMessage('+12 km gelaufen', { author: { id: 'bot-1', bot: true } });

            await sportHandler.handleMessage(message);

            expect(sportService.getAnnouncementChannel).not.toHaveBeenCalled();
            expect(sportService.addEntry).not.toHaveBeenCalled();
        });

        it('ignoriert Nachrichten ohne km-Angabe', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');

            await sportHandler.handleMessage(mockMessage('Moin zusammen'));

            expect(sportService.addEntry).not.toHaveBeenCalled();
        });
    });

    describe('handleMeilensteinSetzen', () => {
        it('speichert den Meilenstein und wandelt literal \\n in echte Zeilenumbrüche', async () => {
            const interaction = {
                memberPermissions: { has: vi.fn().mockReturnValue(false) }, // offen für alle - kein Admin nötig
                options: {
                    getNumber: vi.fn().mockReturnValue(2000),
                    getString: vi.fn().mockReturnValue('Zeile 1\\nZeile 2'),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleMeilensteinSetzen(interaction);

            expect(sportService.setMilestone).toHaveBeenCalledWith(2000, 'Zeile 1\nZeile 2');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('2000 km'));
        });
    });

    describe('handleMeilensteinListe', () => {
        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = {
                memberPermissions: { has: vi.fn().mockReturnValue(false) },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleMeilensteinListe(interaction);

            expect(sportService.getMilestones).not.toHaveBeenCalled();
        });

        it('listet die Meilensteine mit Status-Symbol', async () => {
            vi.mocked(sportService.getMilestones).mockResolvedValue([
                { kilometers: 500, text: 'Erstes Ziel', announced: true },
                { kilometers: 2000, text: 'Grosses Ziel\nmehrzeilig', announced: false },
            ]);
            const interaction = {
                memberPermissions: { has: vi.fn().mockReturnValue(true) },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleMeilensteinListe(interaction);

            const reply = (interaction.reply as any).mock.calls[0][0] as string;
            expect(reply).toContain('**500 km** [gefeiert] – Erstes Ziel');
            expect(reply).toContain('**2000 km** [offen] – Grosses Ziel');
            // nur die erste Zeile des mehrzeiligen Textes
            expect(reply).not.toContain('mehrzeilig');
        });
    });

    describe('handleMeilensteinEntfernen', () => {
        it('bestätigt das Entfernen bei Erfolg', async () => {
            vi.mocked(sportService.removeMilestone).mockResolvedValue(true);
            const interaction = {
                memberPermissions: { has: vi.fn().mockReturnValue(true) },
                options: { getNumber: vi.fn().mockReturnValue(2000) },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleMeilensteinEntfernen(interaction);

            expect(sportService.removeMilestone).toHaveBeenCalledWith(2000);
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('entfernt'));
        });

        it('meldet wenn kein Meilenstein gefunden wurde', async () => {
            vi.mocked(sportService.removeMilestone).mockResolvedValue(false);
            const interaction = {
                memberPermissions: { has: vi.fn().mockReturnValue(true) },
                options: { getNumber: vi.fn().mockReturnValue(999) },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleMeilensteinEntfernen(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('Kein Meilenstein'));
        });
    });

    describe('handleAnkuendigungskanal', () => {
        it('setzt den Kanal mit Administrator-Rechten', async () => {
            const interaction = {
                memberPermissions: { has: vi.fn().mockReturnValue(true) },
                options: { getChannel: vi.fn().mockReturnValue({ id: 'chan-1' }) },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleAnkuendigungskanal(interaction);

            expect(sportService.setAnnouncementChannel).toHaveBeenCalledWith('chan-1');
        });
    });

    describe('Meilenstein-Ankündigung beim Eintragen', () => {
        const eintragenInteraction = () => ({
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
        } as any);

        it('postet einen erreichten Meilenstein in den konfigurierten Kanal', async () => {
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(2000);
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('chan-1');
            vi.mocked(sportService.checkAndMarkReachedMilestones).mockResolvedValue([
                { kilometers: 2000, text: 'Yay, 2000 km!', announced: true },
            ]);
            const send = vi.fn();
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await sportHandler.handleEintragen(eintragenInteraction());

            expect(send).toHaveBeenCalledWith('Yay, 2000 km!');
        });

        it('markiert nichts als erreicht wenn kein Ankündigungskanal gesetzt ist', async () => {
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(2000);
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue(null);

            await sportHandler.handleEintragen(eintragenInteraction());

            expect(sportService.checkAndMarkReachedMilestones).not.toHaveBeenCalled();
        });
    });

    describe('handleLoeschen', () => {
        it('meldet wenn der User keinen Eintrag hat', async () => {
            vi.mocked(sportService.deleteLastEntry).mockResolvedValue(null);
            const interaction = {
                user: { id: 'user-123' },
                options: {},
                reply: vi.fn(),
            } as any;

            await sportHandler.handleLoeschen(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('keinen Eintrag'));
        });

        // Keine Eintrags-ID mehr - gelöscht wird immer der zuletzt eingetragene Eintrag.
        it('löscht den letzten Eintrag und nennt Aktivität + Distanz', async () => {
            vi.mocked(sportService.deleteLastEntry).mockResolvedValue(mockEntry({ kilometers: 12 }));
            const interaction = {
                user: { id: 'user-123' },
                options: {},
                reply: vi.fn(),
            } as any;

            await sportHandler.handleLoeschen(interaction);

            expect(sportService.deleteLastEntry).toHaveBeenCalledWith('user-123');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('12 km'));
        });
    });

    describe('handleBearbeiten', () => {
        it('meldet wenn der User noch keinen Eintrag hat', async () => {
            vi.mocked(sportService.editLastEntry).mockResolvedValue(null);
            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getNumber: vi.fn().mockReturnValue(15),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('noch keinen Eintrag'));
        });

        // Keine Eintrags-ID mehr - korrigiert wird immer der zuletzt eingetragene Eintrag.
        it('korrigiert den letzten Eintrag und bestätigt ihn', async () => {
            vi.mocked(sportService.editLastEntry).mockResolvedValue(mockEntry({ kilometers: 15 }));
            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getNumber: vi.fn().mockReturnValue(15),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(sportService.editLastEntry).toHaveBeenCalledWith('user-123', 15);
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
