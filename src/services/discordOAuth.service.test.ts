import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../config.json', () => ({
    default: {CLIENT_ID: 'client-123', DISCORD_CLIENT_SECRET: 'geheim'}
}));

import {
    buildAuthorizeUrl,
    exchangeCodeForToken,
    fetchDiscordUserId,
    oauthConfigured
} from './discordOAuth.service.js';

describe('discordOAuth.service', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('meldet sich als konfiguriert, wenn ein Client-Secret gesetzt ist', () => {
        expect(oauthConfigured()).toBe(true);
    });

    it('baut die Authorize-URL mit client_id, scope, state und redirect_uri', () => {
        const url = buildAuthorizeUrl('mein-state', 'http://localhost:3000/config/callback');
        expect(url).toContain('client_id=client-123');
        expect(url).toContain('scope=identify');
        expect(url).toContain('state=mein-state');
        expect(url).toContain('response_type=code');
        expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fconfig%2Fcallback');
    });

    it('tauscht den Code gegen ein Access-Token', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({access_token: 'abc'})
        }));
        expect(await exchangeCodeForToken('code', 'redir')).toBe('abc');
    });

    it('gibt bei fehlgeschlagenem Token-Tausch null zurück', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false, status: 400, json: async () => ({})}));
        expect(await exchangeCodeForToken('code', 'redir')).toBeNull();
    });

    it('gibt bei Netzwerkfehler im Token-Tausch null zurück', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('netz')));
        expect(await exchangeCodeForToken('code', 'redir')).toBeNull();
    });

    it('holt die Discord-User-ID', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({id: '999'})
        }));
        expect(await fetchDiscordUserId('token')).toBe('999');
    });

    it('gibt bei fehlgeschlagenem User-Abruf null zurück', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false, status: 401, json: async () => ({})}));
        expect(await fetchDiscordUserId('token')).toBeNull();
    });
});
