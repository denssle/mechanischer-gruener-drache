import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/event.service.js', () => ({
    default: {
        setEvent: vi.fn(),
        getEvent: vi.fn(),
        clearEvent: vi.fn(),
    }
}));

import eventService from '../services/event.service.js';
import eventHandler, { parseGermanDateTime, formatRemaining, randomNoEventReply, NO_EVENT_REPLIES } from './event.handler.js';

describe('parseGermanDateTime', () => {
    it('parst ein gültiges Datum ohne Uhrzeit', () => {
        expect(parseGermanDateTime('24.12.2026', null)).toBe(new Date(2026, 11, 24, 0, 0, 0, 0).getTime());
    });

    it('parst Datum + Uhrzeit', () => {
        expect(parseGermanDateTime('24.12.2026', '18:30')).toBe(new Date(2026, 11, 24, 18, 30, 0, 0).getTime());
    });

    it('lehnt ein falsches Datumsformat ab', () => {
        expect(parseGermanDateTime('2026-12-24', null)).toBeNull();
    });

    it('lehnt einen ungültigen Kalendertag ab', () => {
        expect(parseGermanDateTime('32.01.2026', null)).toBeNull();
        expect(parseGermanDateTime('29.02.2027', null)).toBeNull(); // kein Schaltjahr
    });

    it('lehnt eine ungültige Uhrzeit ab', () => {
        expect(parseGermanDateTime('24.12.2026', '25:00')).toBeNull();
        expect(parseGermanDateTime('24.12.2026', '18-30')).toBeNull();
    });
});

describe('formatRemaining', () => {
    const min = 60000, hour = 3600000, day = 86400000;

    it('formatiert Tage und Stunden', () => {
        expect(formatRemaining(2 * day + 3 * hour)).toBe('2 Tage und 3 Stunden');
    });

    it('nutzt Singular bei genau einem Tag', () => {
        expect(formatRemaining(day)).toBe('1 Tag');
    });

    it('zeigt Stunden und Minuten wenn es keine ganzen Tage mehr sind', () => {
        expect(formatRemaining(3 * hour + 12 * min)).toBe('3 Stunden und 12 Minuten');
    });

    it('fällt auf "weniger als eine Minute" zurück', () => {
        expect(formatRemaining(30000)).toBe('weniger als eine Minute');
    });
});

describe('randomNoEventReply', () => {
    it('liefert immer eine Variante aus NO_EVENT_REPLIES', () => {
        for (let i = 0; i < 50; i++) {
            expect(NO_EVENT_REPLIES).toContain(randomNoEventReply());
        }
    });
});

describe('EventHandler', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    const futureDatum = `01.01.${new Date().getFullYear() + 2}`;

    const mockInteraction = (opts: { isAdmin?: boolean; datum?: string; uhrzeit?: string | null; titel?: string | null } = {}) => ({
        memberPermissions: { has: vi.fn().mockReturnValue(opts.isAdmin ?? true) },
        options: {
            getString: vi.fn((name: string) => {
                if (name === 'datum') return opts.datum ?? futureDatum;
                if (name === 'uhrzeit') return opts.uhrzeit ?? null;
                if (name === 'titel') return opts.titel ?? null;
                return null;
            }),
        },
        reply: vi.fn(),
    } as any);

    describe('handleSetzen', () => {
        it('lehnt ohne Administrator-Rechte ab', async () => {
            const interaction = mockInteraction({ isAdmin: false });

            await eventHandler.handleSetzen(interaction);

            expect(eventService.setEvent).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Administrator-Rechte')
            }));
        });

        it('lehnt ein ungültiges Datum ab', async () => {
            const interaction = mockInteraction({ datum: 'quatsch' });

            await eventHandler.handleSetzen(interaction);

            expect(eventService.setEvent).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Ungültiges Datum')
            }));
        });

        it('lehnt ein Datum in der Vergangenheit ab', async () => {
            const interaction = mockInteraction({ datum: '01.01.2000' });

            await eventHandler.handleSetzen(interaction);

            expect(eventService.setEvent).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Vergangenheit')
            }));
        });

        it('speichert ein gültiges zukünftiges Event mit Titel', async () => {
            const interaction = mockInteraction({ titel: 'LAN-Party' });

            await eventHandler.handleSetzen(interaction);

            expect(eventService.setEvent).toHaveBeenCalledWith(expect.any(Number), 'LAN-Party');
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('LAN-Party'));
        });

        it('speichert ein Event ohne Titel (undefined) und bestätigt neutral', async () => {
            const interaction = mockInteraction();

            await eventHandler.handleSetzen(interaction);

            expect(eventService.setEvent).toHaveBeenCalledWith(expect.any(Number), undefined);
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('Das nächste Event'));
        });
    });

    describe('handleCountdown', () => {
        it('antwortet mit einem spielerischen Fallback wenn kein Event gesetzt ist', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue(null);
            const interaction = mockInteraction();

            await eventHandler.handleCountdown(interaction);

            expect(interaction.reply).toHaveBeenCalledTimes(1);
            expect(NO_EVENT_REPLIES).toContain(interaction.reply.mock.calls[0][0]);
        });

        it('zeigt den Countdown für ein zukünftiges Event mit Titel', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue({ timestamp: Date.now() + 3 * 86400000, title: 'LAN-Party' });
            const interaction = mockInteraction();

            await eventHandler.handleCountdown(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('bis zum nächsten Event'));
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('LAN-Party'));
        });

        it('zeigt den Countdown ohne Titel neutral (ohne Gedankenstrich-Teil)', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue({ timestamp: Date.now() + 3 * 86400000 });
            const interaction = mockInteraction();

            await eventHandler.handleCountdown(interaction);

            const reply = interaction.reply.mock.calls[0][0];
            expect(reply).toContain('bis zum nächsten Event!');
            expect(reply).not.toContain('–');
        });

        it('meldet wenn das Event schon da/vorbei ist', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue({ timestamp: Date.now() - 1000, title: 'LAN-Party' });
            const interaction = mockInteraction();

            await eventHandler.handleCountdown(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('so weit'));
        });
    });

    describe('handleEntfernen', () => {
        it('lehnt ohne Administrator-Rechte ab', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue({ timestamp: Date.now() + 1000, title: 'X' });
            const interaction = mockInteraction({ isAdmin: false });

            await eventHandler.handleEntfernen(interaction);

            expect(eventService.clearEvent).not.toHaveBeenCalled();
        });

        it('meldet wenn gar kein Event gesetzt ist', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue(null);
            const interaction = mockInteraction();

            await eventHandler.handleEntfernen(interaction);

            expect(eventService.clearEvent).not.toHaveBeenCalled();
        });

        it('entfernt ein gesetztes Event', async () => {
            vi.mocked(eventService.getEvent).mockResolvedValue({ timestamp: Date.now() + 1000, title: 'LAN-Party' });
            const interaction = mockInteraction();

            await eventHandler.handleEntfernen(interaction);

            expect(eventService.clearEvent).toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('LAN-Party'));
        });
    });
});
