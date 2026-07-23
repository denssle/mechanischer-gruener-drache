import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../config.json', () => ({
    default: {
        CLIENT_ID: 'client-123',
        GUILD_ID: 'guild-1',
        DISCORD_CLIENT_SECRET: 'geheim',
        CONFIG_SESSION_SECRET: 'test-secret',
        CONFIG_BASE_URL: 'http://localhost:3000'
    }
}));

// client wird nur in Funktionskoerpern benutzt - hier ein schlanker Mock, damit nicht der echte
// client (mit allen Command-Importen) geladen wird.
vi.mock('../client.js', () => ({
    default: {guilds: {cache: new Map()}}
}));

vi.mock('../services/discordOAuth.service.js', () => ({
    oauthConfigured: vi.fn(() => true),
    buildAuthorizeUrl: vi.fn(() => 'https://discord.com/oauth2/authorize?x=1'),
    exchangeCodeForToken: vi.fn(),
    fetchDiscordUserId: vi.fn()
}));

import client from '../client.js';
import * as oauth from '../services/discordOAuth.service.js';
import {signSession, SESSION_COOKIE, STATE_COOKIE} from './config.session.js';
import {
    handleCallback,
    handleConfigPage,
    handleLogin,
    handleLogout,
    requireConfigAuth
} from './config.router.js';

const mockResponse = () => {
    const res: any = {};
    res.type = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    res.redirect = vi.fn().mockReturnValue(res);
    res.headersSent = false;
    return res;
};

const mockRequest = (opts: {cookie?: string; query?: Record<string, string>} = {}) => ({
    headers: {cookie: opts.cookie},
    query: opts.query ?? {}
} as any);

const setGuildMember = (member: unknown, throwOnFetch = false) => {
    const fetch = throwOnFetch
        ? vi.fn().mockRejectedValue(new Error('unbekanntes Mitglied'))
        : vi.fn().mockResolvedValue(member);
    (client.guilds as any).cache = new Map([['guild-1', {members: {fetch}}]]);
};

const adminMember = {permissions: {has: vi.fn().mockReturnValue(true)}};
const normalMember = {permissions: {has: vi.fn().mockReturnValue(false)}};

describe('config.router', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (oauth.oauthConfigured as any).mockReturnValue(true);
        (oauth.buildAuthorizeUrl as any).mockReturnValue('https://discord.com/oauth2/authorize?x=1');
    });

    describe('requireConfigAuth', () => {
        it('lässt einen gültigen Cookie mit weiterhin bestehenden Admin-Rechten durch', async () => {
            setGuildMember(adminMember);
            const req = mockRequest({cookie: `${SESSION_COOKIE}=${signSession('12345')}`});
            const res = mockResponse();
            const next = vi.fn();

            await requireConfigAuth(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.send).not.toHaveBeenCalled();
        });

        it('zeigt ohne gültigen Cookie die Login-Seite', async () => {
            const req = mockRequest();
            const res = mockResponse();
            const next = vi.fn();

            await requireConfigAuth(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.send.mock.calls[0][0]).toContain('Mit Discord anmelden');
        });

        it('sperrt einen aus, der die Admin-Rechte verloren hat, und löscht das Cookie', async () => {
            setGuildMember(normalMember);
            const req = mockRequest({cookie: `${SESSION_COOKIE}=${signSession('12345')}`});
            const res = mockResponse();
            const next = vi.fn();

            await requireConfigAuth(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.send.mock.calls[0][0]).toContain('Mit Discord anmelden');
            const cookie = res.setHeader.mock.calls[0][1] as string;
            expect(cookie).toContain(`${SESSION_COOKIE}=`);
            expect(cookie).toContain('Max-Age=0');
        });

        it('sperrt aus, wenn die Person den Server verlassen hat (fetch wirft)', async () => {
            setGuildMember(adminMember, true);
            const req = mockRequest({cookie: `${SESSION_COOKIE}=${signSession('12345')}`});
            const res = mockResponse();
            const next = vi.fn();

            await requireConfigAuth(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.send.mock.calls[0][0]).toContain('Mit Discord anmelden');
        });

        it('bleibt fail-closed, wenn der Login nicht konfiguriert ist', async () => {
            (oauth.oauthConfigured as any).mockReturnValue(false);
            const req = mockRequest({cookie: `${SESSION_COOKIE}=${signSession('12345')}`});
            const res = mockResponse();
            const next = vi.fn();

            await requireConfigAuth(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(503);
        });
    });

    it('handleConfigPage liefert die HTML-Seite aus', () => {
        const res = mockResponse();
        handleConfigPage(mockRequest(), res);
        const html = res.send.mock.calls[0][0] as string;
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('Mechanischer Grüner Drache');
    });

    it('handleLogin setzt ein state-Cookie und leitet zu Discord', () => {
        const res = mockResponse();
        handleLogin(mockRequest(), res);

        const cookie = res.setHeader.mock.calls[0][1] as string;
        expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(String));
        expect(cookie).toContain(`${STATE_COOKIE}=`);
        expect(res.redirect).toHaveBeenCalledWith('https://discord.com/oauth2/authorize?x=1');
    });

    describe('handleCallback', () => {
        it('lehnt einen state-Mismatch ab', async () => {
            const req = mockRequest({cookie: `${STATE_COOKIE}=aaa`, query: {state: 'bbb', code: 'c'}});
            const res = mockResponse();

            await handleCallback(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(oauth.exchangeCodeForToken).not.toHaveBeenCalled();
        });

        it('meldet einen Admin an (Session-Cookie + Redirect)', async () => {
            (oauth.exchangeCodeForToken as any).mockResolvedValue('tok');
            (oauth.fetchDiscordUserId as any).mockResolvedValue('user-1');
            setGuildMember(adminMember);

            const req = mockRequest({cookie: `${STATE_COOKIE}=s`, query: {state: 's', code: 'c'}});
            const res = mockResponse();

            await handleCallback(req, res);

            const setCookie = res.setHeader.mock.calls[0][1] as string[];
            expect(setCookie[0]).toContain(`${SESSION_COOKIE}=`);
            expect(res.redirect).toHaveBeenCalledWith('/config');
        });

        it('lehnt einen Nicht-Admin ab', async () => {
            (oauth.exchangeCodeForToken as any).mockResolvedValue('tok');
            (oauth.fetchDiscordUserId as any).mockResolvedValue('user-2');
            setGuildMember(normalMember);

            const req = mockRequest({cookie: `${STATE_COOKIE}=s`, query: {state: 's', code: 'c'}});
            const res = mockResponse();

            await handleCallback(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.redirect).not.toHaveBeenCalled();
        });

        it('lehnt ab, wenn der Token-Tausch scheitert', async () => {
            (oauth.exchangeCodeForToken as any).mockResolvedValue(null);

            const req = mockRequest({cookie: `${STATE_COOKIE}=s`, query: {state: 's', code: 'c'}});
            const res = mockResponse();

            await handleCallback(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    it('handleLogout löscht das Session-Cookie und leitet auf /config', () => {
        const res = mockResponse();
        handleLogout(mockRequest(), res);

        const cookie = res.setHeader.mock.calls[0][1] as string;
        expect(cookie).toContain(`${SESSION_COOKIE}=`);
        expect(cookie).toContain('Max-Age=0');
        expect(res.redirect).toHaveBeenCalledWith('/config');
    });
});
