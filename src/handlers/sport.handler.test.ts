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
        getGesamtMinuten: vi.fn(),
        addLegacyKilometer: vi.fn(),
        getLegacyKilometer: vi.fn(),
        setLegacyKilometer: vi.fn(),
        setMilestone: vi.fn(),
        getMilestones: vi.fn(),
        removeMilestone: vi.fn(),
        checkAndMarkReachedMilestones: vi.fn().mockResolvedValue([]),
        getAnnouncementChannel: vi.fn().mockResolvedValue(null),
        setAnnouncementChannel: vi.fn(),
        getLastDailyPostDay: vi.fn().mockResolvedValue(null),
        setLastDailyPostDay: vi.fn(),
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
import sportHandler, { parseKilometer, parseMinuten, erkenneAktivitaet, DEFAULT_AKTIVITAET, BESTAETIGUNGS_REAKTION, formatTag, rundeKilometer, SPORT_HILFE } from './sport.handler.js';
import { HELP_TEXT } from './hilfe.handler.js';

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
            vi.mocked(sportService.getGesamtMinuten).mockResolvedValue(500);
            const interaction = {
                user: {
                    id: 'user-123',
                    displayName: 'Testläufer',
                    displayAvatarURL: vi.fn().mockReturnValue('https://cdn/avatar.png'),
                },
                options: {
                    getString: vi.fn().mockReturnValue('laufen'),
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return 10;
                        if (name === 'minuten') return null;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleEintragen(interaction);

            expect(sportService.addEntry).toHaveBeenCalledWith(
                'user-123',
                'laufen',
                10,
                undefined
            );
            expect(sportService.getGesamtKilometer).toHaveBeenCalled();
            expect(sportService.getGesamtMinuten).toHaveBeenCalled();

            const embed = (interaction.reply as any).mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            // User findet sich per Name + Profilbild im Post wieder.
            expect(json.author.name).toBe('Testläufer');
            expect(json.author.icon_url).toBe('https://cdn/avatar.png');
            expect(json.description).toContain('10 km');
            expect(json.description).toContain('250 km');
            expect(json.description).toContain('500 Aktivitätsminuten');
            // Kein Eintrags-ID-Footer mehr: loeschen/bearbeiten nehmen immer den letzten Eintrag.
            expect(json.footer).toBeUndefined();
        });

        // Prüft gleichzeitig die interne Übersetzung: Minuten-only wird intern mit 0 km gespeichert.
        it('speichert einen Eintrag nur mit Aktivitätsminuten', async () => {
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry({kilometers: 0, minutes: 45}));
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(250);

            const interaction = {
                user: {
                    id: 'user-123',
                    displayName: 'Testläufer',
                    displayAvatarURL: vi.fn().mockReturnValue('https://cdn/avatar.png'),
                },
                options: {
                    getString: vi.fn().mockReturnValue('krafttraining'),
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return null;
                        if (name === 'minuten') return 45;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleEintragen(interaction);

            expect(sportService.addEntry).toHaveBeenCalledWith(
                'user-123',
                'krafttraining',
                0,
                45
            );

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            expect(embed.toJSON().description).toContain('45 min');
        });

        // Kilometer und Minuten zusammen speichern.
        it('speichert Kilometer und Aktivitätsminuten gemeinsam', async () => {
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry({kilometers: 10, minutes: 60}));
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(250);
            vi.mocked(sportService.getGesamtMinuten).mockResolvedValue(500);

            const interaction = {
                user: {
                    id: 'user-123',
                    displayName: 'Testläufer',
                    displayAvatarURL: vi.fn().mockReturnValue('https://cdn/avatar.png'),
                },
                options: {
                    getString: vi.fn().mockReturnValue('radfahren'),
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return 10;
                        if (name === 'minuten') return 60;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleEintragen(interaction);

            expect(sportService.addEntry).toHaveBeenCalledWith(
                'user-123',
                'radfahren',
                10,
                60
            );

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            const description = embed.toJSON().description;

            expect(description).toContain('10 km');
            expect(description).toContain('60 min');
        });

        //  Einträge ohne Kilometer oder Minuten dürfen keinen Eintrag erzeugen.
        it('lehnt einen Eintrag ohne Kilometer und Minuten ab', async () => {
            const interaction = {
                user: {
                    id: 'user-123',
                },
                options: {
                    getString: vi.fn().mockReturnValue('krafttraining'),
                    getNumber: vi.fn().mockReturnValue(null),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleEintragen(interaction);

            expect(sportService.addEntry).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith({
                content: 'Bitte gib Kilometer, Minuten oder beides an.',
                flags: MessageFlags.Ephemeral,
            });
        });

        // Ein Eintrag, der ausschließlich aus 0 besteht, enthält keine tatsächliche Leistung.
        it('lehnt einen Eintrag mit 0 Kilometern und ohne Minuten ab', async () => {
            const interaction = {
                user: {
                    id: 'user-123',
                },
                options: {
                    getString: vi.fn().mockReturnValue('laufen'),
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return 0;
                        if (name === 'minuten') return null;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleEintragen(interaction);

            expect(sportService.addEntry).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith({
                content: 'Bitte gib Kilometer, Minuten oder beides an.',
                flags: MessageFlags.Ephemeral,
            });
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
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return 10;
                        if (name === 'minuten') return null;
                        return null;
                    }),
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

        // Regression 2026-07-14 bis 2026-07-26: HELP_TEXT warb mit „12 km gelaufen", während das
        // "+" längst Pflicht war - wer der Hilfe folgte, bekam gar keine Reaktion und musste den
        // Bot für kaputt halten. Beide Hilfe-Texte werden deshalb gegen den echten Parser geprüft,
        // statt sich darauf zu verlassen, dass jemand beim Ändern an beide Stellen denkt.
        it.each([
            ['HELP_TEXT (/hilfe)', HELP_TEXT],
            ['SPORT_HILFE (/sport hilfe)', SPORT_HILFE],
        ])('jedes km-Beispiel in %s wird vom Parser auch wirklich erkannt', (_name, text) => {
            // Alle in „…" zitierten Beispiele, die eine Kilometer-Angabe enthalten.
            const beispiele = [...text.matchAll(/„([^"„]*\d[^"„]*(?:km|kilometer)[^"„]*)"/gi)].map(m => m[1]);

            expect(beispiele.length).toBeGreaterThan(0);
            for (const beispiel of beispiele) {
                expect(parseKilometer(beispiel), `Beispiel "${beispiel}" wird nicht erkannt`).not.toBeNull();
            }
        });

        it('jedes Minuten-Beispiel in SPORT_HILFE wird vom Parser auch wirklich erkannt', () => {
            // Alle in „…" zitierten Beispiele, die eine Minuten-Angabe enthalten.
            const beispiele = [
                ...SPORT_HILFE.matchAll(/„([^"„]*\d[^"„]*(?:min|minuten)[^"„]*)"/gi),
            ].map(m => m[1]);

            expect(beispiele.length).toBeGreaterThan(0);

            for (const beispiel of beispiele) {
                expect(
                    parseMinuten(beispiel),
                    `Beispiel "${beispiel}" wird nicht erkannt`
                ).not.toBeNull();
            }
        });

        // Bewusst nur die erste Angabe (nicht wie beim Blåhaj-Rechner alle summiert):
        // eine doppelt gezählte Distanz würde die gemeinsame Gesamtstrecke dauerhaft verfälschen.
        it('nimmt nur die erste Kilometer-Angabe', () => {
            expect(parseKilometer('+5 km gelaufen und +7 km geradelt')).toBe(5);
        });
    });

    describe('parseMinuten', () => {
        it.each([
            ['+45 min Krafttraining', 45],
            ['+45min', 45],
            ['heute +45,5 min trainiert', 45.5],
            ['+ 45.5 min', 45.5],
            ['ich habe +60 Minuten trainiert', 60],
        ])('erkennt %s als %s Minuten', (text, erwartet) => {
            expect(parseMinuten(text)).toBe(erwartet);
        });

        it.each([
            ['Nachricht ganz ohne Zahl'],
            ['ich habe +45 Punkte'],
            ['+0 min'],
        ])('gibt null zurück für "%s"', (text) => {
            expect(parseMinuten(text)).toBeNull();
        });

        // Das "+" ist wie bei den Kilometern der bewusste Eintrags-Marker:
        // beiläufig erwähnte Aktivitätszeiten werden ohne ihn nicht erfasst.
        it.each([
            ['45 min Krafttraining'],
            ['ich trainiere seit 45 Minuten'],
        ])('gibt null zurück ohne "+" vor der Zahl: "%s"', (text) => {
            expect(parseMinuten(text)).toBeNull();
        });

        // Bewusst nur die erste Minuten-Angabe, damit eine Mehrfachnennung
        // nicht versehentlich mehrfach als Aktivitätszeit gezählt wird.
        it('nimmt nur die erste Minuten-Angabe', () => {
            expect(parseMinuten('+30 min Krafttraining und +15 min Dehnen')).toBe(30);
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
            ['+10 km Krafttraining', 'krafttraining'],
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

        it('verwechselt "Kraftfahrzeug" nicht mit Krafttraining', () => {
            expect(erkenneAktivitaet('Kraftfahrzeug')).toBe(DEFAULT_AKTIVITAET);
        });
    });

    describe('handleMessage (Auto-Erfassung im Sport-Kanal)', () => {
        // quittiert = der Bot hat schon eine ✅ an die Nachricht gehängt (me: true).
        const mockMessage = (content: string, overrides: Record<string, unknown> = {}, quittiert = false) => ({
            author: { id: 'user-123', bot: false },
            channelId: 'sport-kanal',
            content,
            react: vi.fn(),
            reactions: {
                cache: new Map(quittiert ? [[BESTAETIGUNGS_REAKTION, { me: true }]] : []),
            },
            ...overrides,
        }) as any;

        it('trägt eine km-Angabe im Sport-Kanal automatisch ein', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
            const message = mockMessage('heute +12 km geradelt');

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).toHaveBeenCalledWith('user-123', 'radfahren', 12, undefined);
        });

        it('trägt eine Minuten-Angabe im Sport-Kanal automatisch ein', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(
                mockEntry({ activity: 'krafttraining', kilometers: 0, minutes: 45 })
            );
            const message = mockMessage('+45 min Krafttraining');

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).toHaveBeenCalledWith(
                'user-123',
                'krafttraining',
                0,
                45
            );
        });

        it('prüft bei einer reinen Minuten-Angabe keine Kilometer-Meilensteine', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(
                mockEntry({ activity: 'krafttraining', kilometers: 0, minutes: 45 })
            );

            const message = mockMessage('+45 min Krafttraining');

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).toHaveBeenCalledWith(
                'user-123',
                'krafttraining',
                0,
                45
            );

            expect(sportService.checkAndMarkReachedMilestones).not.toHaveBeenCalled();
        });

        it('trägt Kilometer und Aktivitätsminuten aus derselben Nachricht gemeinsam ein', async () => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(
                mockEntry({ activity: 'radfahren', kilometers: 10, minutes: 60 })
            );
            const message = mockMessage('+10 km +60 min Radfahren');

            await sportHandler.handleMessage(message);

            expect(sportService.addEntry).toHaveBeenCalledWith(
                'user-123',
                'radfahren',
                10,
                60
            );
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

    describe('handleMessageUpdate (nachträglich bearbeitete Nachrichten)', () => {
        const mockMessage = (content: string, overrides: Record<string, unknown> = {}, quittiert = false) => ({
            author: { id: 'user-123', bot: false },
            channelId: 'sport-kanal',
            content,
            partial: false,
            react: vi.fn(),
            reactions: {
                cache: new Map(quittiert ? [[BESTAETIGUNGS_REAKTION, { me: true }]] : []),
            },
            ...overrides,
        }) as any;

        beforeEach(() => {
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('sport-kanal');
            vi.mocked(sportService.addEntry).mockResolvedValue(mockEntry());
        });

        // Der Hauptfall: das "+" wurde vergessen und nachgetragen.
        it('trägt eine nachträglich ergänzte km-Angabe ein', async () => {
            const message = mockMessage('heute +12 km geradelt');

            await sportHandler.handleMessageUpdate(message);

            expect(sportService.addEntry).toHaveBeenCalledWith('user-123', 'radfahren', 12, undefined);
            expect(message.react).toHaveBeenCalledWith(BESTAETIGUNGS_REAKTION);
        });

        // Discord feuert MessageUpdate bei JEDER Bearbeitung. Ohne diesen Schutz würde ein Nachsatz
        // an "+5 km" die Kilometer ein zweites Mal eintragen und die Gesamtdistanz verfälschen.
        it('trägt nichts erneut ein, wenn die Nachricht schon quittiert ist', async () => {
            const message = mockMessage('+5 km gelaufen, war schön', {}, true);

            await sportHandler.handleMessageUpdate(message);

            expect(sportService.addEntry).not.toHaveBeenCalled();
            expect(message.react).not.toHaveBeenCalled();
        });

        // Eine ✅ von einem anderen Mitglied ist keine Quittung des Bots.
        it('lässt sich von einer fremden Reaktion nicht abhalten', async () => {
            const message = mockMessage('+12 km gelaufen');
            message.reactions.cache.set(BESTAETIGUNGS_REAKTION, { me: false });

            await sportHandler.handleMessageUpdate(message);

            expect(sportService.addEntry).toHaveBeenCalled();
        });

        // Ohne fetch() wären content und reactions einer nicht gecachten Nachricht leer.
        it('lädt partielle Nachrichten nach', async () => {
            const vollstaendig = mockMessage('+8 km gelaufen');
            const partiell = { partial: true, fetch: vi.fn().mockResolvedValue(vollstaendig) } as any;

            await sportHandler.handleMessageUpdate(partiell);

            expect(partiell.fetch).toHaveBeenCalled();
            expect(sportService.addEntry).toHaveBeenCalledWith('user-123', 'laufen', 8, undefined);
        });

        it('ignoriert Bearbeitungen außerhalb des Sport-Kanals', async () => {
            const message = mockMessage('+3 km bis zum Bahnhof', { channelId: 'anderer-kanal' });

            await sportHandler.handleMessageUpdate(message);

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

    describe('formatTag', () => {
        // Aus lokalen Datumsteilen (nicht toISOString) - sonst kippt der Tag um Mitternacht in UTC.
        it.each([
            [new Date(2026, 6, 9), '2026-07-09'],
            [new Date(2026, 11, 1), '2026-12-01'],
            [new Date(2026, 0, 31, 23, 59), '2026-01-31'],
        ])('formatiert %s als %s', (date, erwartet) => {
            expect(formatTag(date as Date)).toBe(erwartet);
        });
    });

    describe('initTaeglicherPost', () => {
        // Frischer Deploy: Marker auf heute setzen, aber NICHT posten - erste Meldung erst nächste Nacht.
        it('setzt den Tagesmarker auf heute, wenn noch keiner existiert', async () => {
            vi.mocked(sportService.getLastDailyPostDay).mockResolvedValue(null);

            await sportHandler.initTaeglicherPost();

            expect(sportService.setLastDailyPostDay).toHaveBeenCalledWith(formatTag(new Date()));
        });

        // Ist der Marker (auch von einem früheren Tag) gesetzt, bleibt er stehen - die
        // Ausfall-Nachholung in posteTaeglichenAktivitaetsstand übernimmt dann.
        it('lässt einen bestehenden Marker unangetastet', async () => {
            vi.mocked(sportService.getLastDailyPostDay).mockResolvedValue('2026-07-01');

            await sportHandler.initTaeglicherPost();

            expect(sportService.setLastDailyPostDay).not.toHaveBeenCalled();
        });
    });

    describe('posteTaeglichenAktivitaetsstand', () => {
        it('postet Kilometer und Aktivitätsminuten und setzt den Tagesmarker, wenn heute noch nicht gepostet', async () => {
            vi.mocked(sportService.getLastDailyPostDay).mockResolvedValue('2026-07-01');
            vi.mocked(sportService.getGesamtKilometer).mockResolvedValue(1234);
            vi.mocked(sportService.getGesamtMinuten).mockResolvedValue(567);
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue('chan-1');
            const send = vi.fn();
            vi.mocked(client.channels.fetch).mockResolvedValue({ send } as any);

            await sportHandler.posteTaeglichenAktivitaetsstand();

            expect(send).toHaveBeenCalledWith(
                expect.stringContaining('1234 km')
            );
            expect(send).toHaveBeenCalledWith(
                expect.stringContaining('567 Aktivitätsminuten')
            );
            expect(sportService.setLastDailyPostDay).toHaveBeenCalledWith(
                formatTag(new Date())
            );
        });

        // Doppelpost-Schutz: heute schon gepostet -> nichts tun (der Timer stupst jede Minute an).
        it('postet nicht, wenn heute bereits gepostet wurde', async () => {
            vi.mocked(sportService.getLastDailyPostDay).mockResolvedValue(formatTag(new Date()));

            await sportHandler.posteTaeglichenAktivitaetsstand();

            expect(sportService.getAnnouncementChannel).not.toHaveBeenCalled();
            expect(sportService.setLastDailyPostDay).not.toHaveBeenCalled();
        });

        // Ohne abrufbaren Kanal bleibt der Marker stehen -> wird nachgeholt, sobald ein Kanal existiert.
        it('setzt den Marker nicht, wenn kein Kanal konfiguriert ist', async () => {
            vi.mocked(sportService.getLastDailyPostDay).mockResolvedValue('2026-07-01');
            vi.mocked(sportService.getAnnouncementChannel).mockResolvedValue(null);

            await sportHandler.posteTaeglichenAktivitaetsstand();

            expect(sportService.setLastDailyPostDay).not.toHaveBeenCalled();
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
        it('löscht den letzten Eintrag und nennt Aktivität + Leistung', async () => {
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

    it('nennt beim Löschen eines reinen Minuten-Eintrags nur die Aktivitätsminuten', async () => {
        vi.mocked(sportService.deleteLastEntry).mockResolvedValue(
            mockEntry({
                activity: 'krafttraining',
                kilometers: 0,
                minutes: 45,
            })
        );

        const interaction = {
            user: { id: 'user-123' },
            options: {},
            reply: vi.fn(),
        } as any;

        await sportHandler.handleLoeschen(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.stringContaining('45 min')
        );
        expect(interaction.reply).not.toHaveBeenCalledWith(
            expect.stringContaining('0 km')
        );
    });

    describe('handleBearbeiten', () => {
        it('meldet wenn der User noch keinen Eintrag hat', async () => {
            vi.mocked(sportService.editLastEntry).mockResolvedValue(null);
            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return 15;
                        if (name === 'minuten') return null;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('noch keinen Eintrag'));
        });

        // Keine Eintrags-ID mehr - korrigiert wird immer der zuletzt eingetragene Eintrag.
        it('korrigiert den letzten Eintrag und bestätigt ihn', async () => {
            vi.mocked(sportService.editLastEntry).mockResolvedValue(
                mockEntry({ kilometers: 15 })
            );

            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return 15;
                        if (name === 'minuten') return null;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(sportService.editLastEntry).toHaveBeenCalledWith(
                'user-123',
                15,
                undefined
            );

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.stringContaining('15 km')
            );
        });

        it('korrigiert nur die Aktivitätsminuten und behält die Kilometer bei', async () => {
            vi.mocked(sportService.editLastEntry).mockResolvedValue(
                mockEntry({ kilometers: 10, minutes: 45 })
            );

            const interaction = {
                user: { id: 'user-123' },
                options: {
                    getNumber: vi.fn((name: string) => {
                        if (name === 'kilometer') return null;
                        if (name === 'minuten') return 45;
                        return null;
                    }),
                },
                reply: vi.fn(),
            } as any;

            await sportHandler.handleBearbeiten(interaction);

            expect(sportService.editLastEntry).toHaveBeenCalledWith(
                'user-123',
                undefined,
                45
            );

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.stringContaining('10 km · 45 min')
            );
        });

    it('korrigiert Kilometer und Aktivitätsminuten gemeinsam', async () => {
        vi.mocked(sportService.editLastEntry).mockResolvedValue(
            mockEntry({ kilometers: 15, minutes: 60 })
        );

        const interaction = {
            user: { id: 'user-123' },
            options: {
                getNumber: vi.fn((name: string) => {
                    if (name === 'kilometer') return 15;
                    if (name === 'minuten') return 60;
                    return null;
                }),
            },
            reply: vi.fn(),
        } as any;

        await sportHandler.handleBearbeiten(interaction);

        expect(sportService.editLastEntry).toHaveBeenCalledWith(
            'user-123',
            15,
            60
        );

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.stringContaining('15 km · 60 min')
        );
    });

    it('lehnt eine Korrektur ohne Kilometer und Minuten ab', async () => {
        const interaction = {
            user: { id: 'user-123' },
            options: {
                getNumber: vi.fn().mockReturnValue(null),
            },
            reply: vi.fn(),
        } as any;

        await sportHandler.handleBearbeiten(interaction);

        expect(sportService.editLastEntry).not.toHaveBeenCalled();

        expect(interaction.reply).toHaveBeenCalledWith({
            content: 'Bitte gib Kilometer, Minuten oder beides an.',
            flags: MessageFlags.Ephemeral,
        });
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

    it('gruppiert und summiert Kilometer und Aktivitätsminuten pro Aktivität', async () => {
        vi.mocked(sportService.getUserEntries).mockResolvedValue([
            mockEntry({ activity: 'laufen', kilometers: 10, minutes: 30 }),
            mockEntry({ activity: 'laufen', kilometers: 5, minutes: 20 }),
            mockEntry({ activity: 'radfahren', kilometers: 20, minutes: 60 }),
        ]);

        const interaction = {
            user: { id: 'user-123' },
            reply: vi.fn(),
        } as any;

        await sportHandler.handleStatistik(interaction);

        const reply = (interaction.reply as any).mock.calls[0][0] as string;

        expect(reply).toContain('Laufen – 15 km · 50 min');
        expect(reply).toContain('Radfahren – 20 km · 60 min');
        expect(reply).toContain('Gesamt: **35 km** und **110 Aktivitätsminuten**');
    });

    it('zeigt eine reine Minuten-Aktivität ohne 0 km an', async () => {
        vi.mocked(sportService.getUserEntries).mockResolvedValue([
            mockEntry({
                activity: 'krafttraining',
                kilometers: 0,
                minutes: 45,
            }),
        ]);

        const interaction = {
            user: { id: 'user-123' },
            reply: vi.fn(),
        } as any;

        await sportHandler.handleStatistik(interaction);

        const reply = (interaction.reply as any).mock.calls[0][0] as string;

        expect(reply).toContain('Krafttraining – 45 min');
        expect(reply).not.toContain('Krafttraining – 0 km');
        expect(reply).toContain('45 Aktivitätsminuten');
    });

    describe('rundeKilometer', () => {
        it('rundet kaufmännisch auf ganze Kilometer', () => {
            expect(rundeKilometer(249.4)).toBe(249);
            expect(rundeKilometer(249.5)).toBe(250);
            expect(rundeKilometer(1000)).toBe(1000);
        });
    });

});
