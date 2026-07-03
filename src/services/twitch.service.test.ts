import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type twitchServiceModule from './twitch.service.js';

vi.mock('../../config.json', () => ({
    default: {
        TWITCH_CLIENT_ID: 'client-id',
        TWITCH_CLIENT_SECRET: 'client-secret',
        TWITCH_WEBHOOK_SECRET: 'webhook-secret',
    }
}));

const mockTokenResponse = () => ({
    ok: true,
    json: async () => ({ access_token: 'token-1', expires_in: 5_000_000 }),
});

// Der Access-Token wird im Service-Singleton gecacht - für jeden Test wird
// das Modul frisch importiert, damit der Cache nicht zwischen Tests durchsickert.
const freshTwitchService = async (): Promise<typeof twitchServiceModule> => {
    vi.resetModules();
    return (await import('./twitch.service.js')).default;
};

describe('TwitchService', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('getUserByLogin', () => {
        it('gibt den User zurück wenn Twitch ihn findet', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: [{ id: 'twitch-1', login: 'teststreamer', display_name: 'TestStreamer' }] }),
                } as any);

            const user = await twitchService.getUserByLogin('teststreamer');

            expect(user).toEqual({ id: 'twitch-1', login: 'teststreamer', display_name: 'TestStreamer' });
        });

        it('gibt null zurück wenn Twitch keinen User findet', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as any);

            const user = await twitchService.getUserByLogin('unbekannt');

            expect(user).toBeNull();
        });

        it('gibt null zurück wenn die Twitch-API einen Fehler liefert', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: false, statusText: 'Internal Server Error' } as any);

            const user = await twitchService.getUserByLogin('teststreamer');

            expect(user).toBeNull();
        });
    });

    describe('subscribeToStreamOnline', () => {
        it('gibt die Subscription-ID bei Erfolg zurück', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'sub-1', status: 'enabled', type: 'stream.online' }] }) } as any);

            const subscriptionId = await twitchService.subscribeToStreamOnline('twitch-1');

            expect(subscriptionId).toBe('sub-1');
        });

        it('gibt null zurück wenn die Registrierung fehlschlägt', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: false, statusText: 'Conflict' } as any);

            const subscriptionId = await twitchService.subscribeToStreamOnline('twitch-1');

            expect(subscriptionId).toBeNull();
        });
    });

    describe('unsubscribeFromStreamOnline', () => {
        it('gibt true bei Erfolg zurück', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: true } as any);

            const result = await twitchService.unsubscribeFromStreamOnline('sub-1');

            expect(result).toBe(true);
        });

        it('behandelt 404 (Subscription bei Twitch bereits weg) als Erfolg', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' } as any);

            const result = await twitchService.unsubscribeFromStreamOnline('sub-1');

            expect(result).toBe(true);
        });

        it('gibt false bei einem echten Fehler zurück', async () => {
            const twitchService = await freshTwitchService();
            vi.mocked(fetch)
                .mockResolvedValueOnce(mockTokenResponse() as any)
                .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' } as any);

            const result = await twitchService.unsubscribeFromStreamOnline('sub-1');

            expect(result).toBe(false);
        });
    });
});
