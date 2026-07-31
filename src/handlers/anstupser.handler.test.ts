import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {MessageFlags} from 'discord.js';

vi.mock('../services/anstupser.service.js', () => ({
    default: {
        abonniere: vi.fn(),
        kuendige: vi.fn(),
        istAbonniert: vi.fn(),
        holeAbonnenten: vi.fn(async () => []),
        getLastSentDay: vi.fn(async () => null),
        setLastSentDay: vi.fn(),
    }
}));

vi.mock('../client.js', () => ({
    default: {users: {fetch: vi.fn()}}
}));

import anstupserService from '../services/anstupser.service.js';
import client from '../client.js';
import {DM_GESCHLOSSEN} from '../services/dm.service.js';
import anstupserHandler, {
    ANSTUPSER_TEXT,
    formatTag,
    istAnstupserZeit,
    STUNDE,
    MINUTE,
} from './anstupser.handler.js';

const mockInteraction = (userId = 'user-1') => ({
    user: {id: userId},
    reply: vi.fn(),
} as any);

// Ein User, dessen send() gelingt bzw. mit dem gegebenen Code scheitert.
const mockUser = (fehlerCode?: number) => ({
    send: fehlerCode === undefined
        ? vi.fn().mockResolvedValue(undefined)
        : vi.fn().mockRejectedValue(Object.assign(new Error('nope'), {code: fehlerCode})),
});

describe('AnstupserHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // clearAllMocks leert nur die Aufrufe, NICHT die per mockResolvedValue gesetzten
        // Implementierungen - ohne das hier blutet der Tagesmarker eines Tests in den nächsten.
        vi.mocked(anstupserService.getLastSentDay).mockResolvedValue(null);
        vi.mocked(anstupserService.setLastSentDay).mockResolvedValue(undefined);
        vi.mocked(anstupserService.holeAbonnenten).mockResolvedValue([]);
    });

    describe('istAnstupserZeit', () => {
        it('trifft genau 13:37', () => {
            expect(istAnstupserZeit(new Date(2026, 6, 26, STUNDE, MINUTE))).toBe(true);
        });

        it.each([
            [13, 36],
            [13, 38],
            [12, 37],
            [14, 37],
            [0, 0],
        ])('ist zu %s:%s nicht dran', (stunde, minute) => {
            expect(istAnstupserZeit(new Date(2026, 6, 26, stunde, minute))).toBe(false);
        });
    });

    it('formatTag baut ein lokales YYYY-MM-DD', () => {
        expect(formatTag(new Date(2026, 0, 5, 13, 37))).toBe('2026-01-05');
    });

    describe('handleAn', () => {
        // Die Test-DM ist der Kern der Anmeldung: kommt sie nicht an, wartet die Person sonst
        // wochenlang still auf nichts.
        it('schickt eine Test-DM und abonniert erst danach', async () => {
            const user = mockUser();
            vi.mocked(client.users.fetch).mockResolvedValue(user as any);
            const interaction = mockInteraction('user-1');

            await anstupserHandler.handleAn(interaction);

            expect(user.send).toHaveBeenCalledWith(ANSTUPSER_TEXT);
            expect(anstupserService.abonniere).toHaveBeenCalledWith('user-1');
            expect(interaction.reply.mock.calls[0][0].content).toContain('Angemeldet');
            expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
        });

        it('abonniert NICHT, wenn die DM nicht zustellbar ist, und sagt es', async () => {
            vi.mocked(client.users.fetch).mockResolvedValue(mockUser(DM_GESCHLOSSEN) as any);
            const interaction = mockInteraction('user-1');

            await anstupserHandler.handleAn(interaction);

            expect(anstupserService.abonniere).not.toHaveBeenCalled();
            expect(interaction.reply.mock.calls[0][0].content).toContain('Direktnachrichten');
            expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
        });

        it('abonniert auch bei einem sonstigen DM-Fehler nicht', async () => {
            vi.mocked(client.users.fetch).mockRejectedValue(new Error('Netzwerk weg'));

            await anstupserHandler.handleAn(mockInteraction());

            expect(anstupserService.abonniere).not.toHaveBeenCalled();
        });
    });

    it('handleAus meldet ab', async () => {
        const interaction = mockInteraction('user-2');

        await anstupserHandler.handleAus(interaction);

        expect(anstupserService.kuendige).toHaveBeenCalledWith('user-2');
        expect(interaction.reply.mock.calls[0][0].content).toContain('Abgemeldet');
    });

    describe('handleStatus', () => {
        it.each([
            [true, 'angemeldet'],
            [false, 'nicht angemeldet'],
        ])('meldet abonniert=%s', async (abonniert, erwartet) => {
            vi.mocked(anstupserService.istAbonniert).mockResolvedValue(abonniert);
            const interaction = mockInteraction();

            await anstupserHandler.handleStatus(interaction);

            expect(interaction.reply.mock.calls[0][0].content).toContain(erwartet);
        });
    });

    describe('sendeAnstupser', () => {
        const um1337 = new Date(2026, 6, 26, STUNDE, MINUTE);

        afterEach(() => {
            vi.useRealTimers();
        });

        const zurZeit = (date: Date) => {
            vi.useFakeTimers();
            vi.setSystemTime(date);
        };

        it('verschickt an alle Abonnenten und merkt sich den Tag', async () => {
            zurZeit(um1337);
            vi.mocked(anstupserService.holeAbonnenten).mockResolvedValue(['a', 'b']);
            const user = mockUser();
            vi.mocked(client.users.fetch).mockResolvedValue(user as any);

            await anstupserHandler.sendeAnstupser();

            expect(user.send).toHaveBeenCalledTimes(2);
            expect(user.send).toHaveBeenCalledWith(ANSTUPSER_TEXT);
            expect(anstupserService.setLastSentDay).toHaveBeenCalledWith('2026-07-26');
        });

        it('tut außerhalb von 13:37 gar nichts', async () => {
            zurZeit(new Date(2026, 6, 26, 15, 0));

            await anstupserHandler.sendeAnstupser();

            expect(anstupserService.holeAbonnenten).not.toHaveBeenCalled();
            expect(anstupserService.setLastSentDay).not.toHaveBeenCalled();
        });

        // Verpasste Tage werden BEWUSST nicht nachgeholt: ein Anstupser um 15 Uhr ist sinnlos.
        // Der Tagesmarker darf hier also nicht als "hole nach" gelesen werden.
        it('holt einen verpassten Tag nicht nach', async () => {
            zurZeit(new Date(2026, 6, 27, 9, 0));
            vi.mocked(anstupserService.getLastSentDay).mockResolvedValue('2026-07-25');

            await anstupserHandler.sendeAnstupser();

            expect(anstupserService.holeAbonnenten).not.toHaveBeenCalled();
        });

        it('verschickt nicht zweimal am selben Tag', async () => {
            zurZeit(um1337);
            vi.mocked(anstupserService.getLastSentDay).mockResolvedValue('2026-07-26');

            await anstupserHandler.sendeAnstupser();

            expect(anstupserService.holeAbonnenten).not.toHaveBeenCalled();
        });

        // Eine geschlossene DM darf die DMs der anderen nicht abbrechen.
        it('macht weiter, wenn eine DM scheitert', async () => {
            zurZeit(um1337);
            vi.mocked(anstupserService.holeAbonnenten).mockResolvedValue(['zu', 'offen']);
            const offen = mockUser();
            vi.mocked(client.users.fetch).mockImplementation(async (id: any) =>
                (id === 'zu' ? mockUser(DM_GESCHLOSSEN) : offen) as any);

            await anstupserHandler.sendeAnstupser();

            expect(offen.send).toHaveBeenCalledWith(ANSTUPSER_TEXT);
        });

        // Der Marker wird VOR dem Versand gesetzt: sonst könnte ein zweiter Timer-Durchlauf
        // während des (bei vielen DMs langsamen) Versands dieselbe Runde erneut starten.
        it('beansprucht den Tag vor dem Versand', async () => {
            zurZeit(um1337);
            const reihenfolge: string[] = [];
            vi.mocked(anstupserService.setLastSentDay).mockImplementation(async () => {
                reihenfolge.push('marker');
            });
            vi.mocked(anstupserService.holeAbonnenten).mockImplementation(async () => {
                reihenfolge.push('abonnenten');
                return [];
            });

            await anstupserHandler.sendeAnstupser();

            expect(reihenfolge).toEqual(['marker', 'abonnenten']);
        });

        it('schluckt Fehler (darf den Timer nicht mitreißen)', async () => {
            zurZeit(um1337);
            vi.mocked(anstupserService.getLastSentDay).mockRejectedValue(new Error('Redis weg'));

            await expect(anstupserHandler.sendeAnstupser()).resolves.toBeUndefined();
        });
    });
});
