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

vi.mock('./config.settings.js', () => ({
    sammleEinstellungen: vi.fn(() => Promise.resolve([
        {label: 'Protokoll-Kanal', wert: '#log', status: 'ok'}
    ])),
    holeTextKanaele: vi.fn(() => [{id: 'c1', name: 'allgemein'}]),
    ladeKanalFelder: vi.fn(() => Promise.resolve([
        {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'c1'}
    ])),
    istGueltigerTextKanal: vi.fn((id: string) => id === 'c1'),
    istKanalFeld: vi.fn((feld: string) => feld === 'protokoll'),
    speichereKanal: vi.fn(() => Promise.resolve()),
    holeRollen: vi.fn(() => [{id: 'r1', name: 'Abonnenten'}]),
    holeTwitchRolleId: vi.fn(() => Promise.resolve('r1')),
    istGueltigeRolle: vi.fn((id: string) => id === 'r1'),
    speichereTwitchRolle: vi.fn(() => Promise.resolve())
}));

import client from '../client.js';
import * as oauth from '../services/discordOAuth.service.js';
import * as settings from './config.settings.js';
import {createCsrfToken, signSession, SESSION_COOKIE, STATE_COOKIE} from './config.session.js';
import {
    escapeHtml,
    handleCallback,
    handleConfigPage,
    handleKanalSpeichern,
    handleLogin,
    handleLogout,
    handleRolleSpeichern,
    renderEinstellungen,
    renderKanalFormulare,
    renderRollenFormular,
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
    res.locals = {};
    return res;
};

const mockRequest = (opts: {cookie?: string; query?: Record<string, string>; body?: unknown} = {}) => ({
    headers: {cookie: opts.cookie},
    query: opts.query ?? {},
    body: opts.body
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
            // User-ID wird für nachgelagerte Handler (CSRF-Token) durchgereicht.
            expect(res.locals.configUserId).toBe('12345');
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

    it('handleConfigPage rendert Einstellungen und Bearbeiten-Formulare', async () => {
        const res = mockResponse();
        res.locals.configUserId = '12345';

        await handleConfigPage(mockRequest(), res);

        const html = res.send.mock.calls[0][0] as string;
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('Protokoll-Kanal');
        expect(html).toContain('#log');
        // Kanal-Formular inkl. CSRF-Token, Feld-Kennung und vorausgewähltem Kanal
        expect(html).toContain('<form method="post" action="/config/kanal">');
        expect(html).toContain('name="feld" value="protokoll"');
        expect(html).toContain(createCsrfToken('12345'));
        expect(html).toContain('value="c1" selected');
        // Rollen-Formular mit "— keine —" und vorausgewählter Rolle
        expect(html).toContain('<form method="post" action="/config/rolle">');
        expect(html).toContain('— keine —');
        expect(html).toContain('value="r1" selected');
    });

    it('handleConfigPage zeigt den Gespeichert-Hinweis nach dem Redirect', async () => {
        const res = mockResponse();
        res.locals.configUserId = '12345';

        await handleConfigPage(mockRequest({query: {gespeichert: '1'}}), res);

        expect(res.send.mock.calls[0][0]).toContain('Gespeichert.');
    });

    describe('handleKanalSpeichern', () => {
        const gueltigeAnfrage = (body: Record<string, string>) => mockRequest({body});

        it('speichert einen gültigen Kanal und leitet zurück', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleKanalSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'protokoll', kanal: 'c1'}), res
            );

            expect(settings.speichereKanal).toHaveBeenCalledWith('protokoll', 'c1');
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('lehnt ein fehlendes/falsches CSRF-Token ab und speichert nicht', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleKanalSpeichern(gueltigeAnfrage({feld: 'protokoll', kanal: 'c1'}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(settings.speichereKanal).not.toHaveBeenCalled();
        });

        it('lehnt eine unbekannte Einstellung ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleKanalSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'quatsch', kanal: 'c1'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereKanal).not.toHaveBeenCalled();
        });

        it('lehnt einen Kanal ab, der nicht in der Liste steht', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleKanalSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'protokoll', kanal: 'fremder-kanal'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereKanal).not.toHaveBeenCalled();
        });
    });

    it('renderKanalFormulare escaped Kanalnamen, markiert den aktuellen Kanal und trägt die Feld-Kennung', () => {
        const html = renderKanalFormulare(
            [{schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'b'}],
            [{id: 'a', name: '<böse>'}, {id: 'b', name: 'log'}],
            'token-123'
        );
        expect(html).toContain('&lt;böse&gt;');
        expect(html).not.toContain('<böse>');
        expect(html).toContain('value="b" selected');
        expect(html).toContain('value="token-123"');
        expect(html).toContain('name="feld" value="protokoll"');
    });

    describe('handleRolleSpeichern', () => {
        const gueltigeAnfrage = (body: Record<string, string>) => mockRequest({body});

        it('speichert eine gültige Rolle und leitet zurück', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), rolle: 'r1'}), res
            );

            expect(settings.speichereTwitchRolle).toHaveBeenCalledWith('r1');
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('entfernt die Rolle bei leerem Wert (— keine —)', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), rolle: ''}), res
            );

            expect(settings.speichereTwitchRolle).toHaveBeenCalledWith(null);
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('lehnt ein fehlendes CSRF-Token ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(gueltigeAnfrage({rolle: 'r1'}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(settings.speichereTwitchRolle).not.toHaveBeenCalled();
        });

        it('lehnt eine unbekannte Rolle ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), rolle: 'fremde-rolle'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereTwitchRolle).not.toHaveBeenCalled();
        });
    });

    it('renderRollenFormular bietet "— keine —" und markiert die aktuelle Rolle', () => {
        const html = renderRollenFormular(
            [{id: 'r1', name: '<b>Abo</b>'}, {id: 'r2', name: 'Zuschauer'}], 'r2', 'token-9'
        );
        expect(html).toContain('— keine —');
        expect(html).toContain('&lt;b&gt;Abo&lt;/b&gt;');
        expect(html).not.toContain('<b>Abo</b>');
        expect(html).toContain('value="r2" selected');
        expect(html).toContain('<form method="post" action="/config/rolle">');
    });

    it('renderRollenFormular markiert "— keine —" wenn keine Rolle gesetzt ist', () => {
        const html = renderRollenFormular([{id: 'r1', name: 'Abo'}], null, 'token-9');
        expect(html).toContain('value="" selected>— keine —');
    });

    describe('escapeHtml / renderEinstellungen', () => {
        it('escapeHtml neutralisiert HTML-Sonderzeichen', () => {
            expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;');
        });

        it('renderEinstellungen escaped Label und Wert (kein XSS)', () => {
            const html = renderEinstellungen([
                {label: 'Event', wert: '<b>böse</b>', status: 'warnung'}
            ]);
            expect(html).toContain('&lt;b&gt;böse&lt;/b&gt;');
            expect(html).not.toContain('<b>böse</b>');
        });
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
