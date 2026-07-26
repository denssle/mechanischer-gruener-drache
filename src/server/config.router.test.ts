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

// config.router importiert den greeting.handler (fuer den Morgengruss-Lernen-Button) - schlank mocken,
// damit nicht der echte Handler (mit client/redis) geladen wird.
vi.mock('../handlers/greeting.handler.js', () => ({
    default: {lerneAusHistorie: vi.fn()}
}));

// Log-Puffer schlank mocken - die Log-Ansicht liest nur getLogEntries.
vi.mock('../services/logBuffer.service.js', () => ({
    getLogEntries: vi.fn(() => [])
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
    speichereTwitchRolle: vi.fn(() => Promise.resolve()),
    holeEventFelder: vi.fn(() => Promise.resolve({datum: '2026-12-24', uhrzeit: '18:00', titel: 'Weihnachtstreffen'})),
    speichereEventDaten: vi.fn(() => Promise.resolve()),
    entferneEvent: vi.fn(() => Promise.resolve()),
    holeMitglieder: vi.fn(() => [{id: 'm1', name: 'Tirsis'}]),
    istGueltigesMitglied: vi.fn((id: string) => id === 'm1'),
    speichereKilometer: vi.fn(() => Promise.resolve()),
    holeLegacyKilometer: vi.fn(() => Promise.resolve(1250)),
    addiereLegacyKilometer: vi.fn(() => Promise.resolve()),
    setzeLegacyKilometer: vi.fn(() => Promise.resolve()),
    holeMeilensteine: vi.fn(() => Promise.resolve([{kilometers: 1000, text: 'Tausend!', announced: true}])),
    entferneMeilenstein: vi.fn(() => Promise.resolve())
}));

import client from '../client.js';
import * as oauth from '../services/discordOAuth.service.js';
import * as settings from './config.settings.js';
import greetingHandler from '../handlers/greeting.handler.js';
import * as logBuffer from '../services/logBuffer.service.js';
import {createCsrfToken, signSession, SESSION_COOKIE, STATE_COOKIE} from './config.session.js';
import {
    escapeHtml,
    handleCallback,
    handleConfigPage,
    handleEventSpeichern,
    handleKanalSpeichern,
    handleLogin,
    handleLogout,
    handleLogs,
    handleMorgengrussLernen,
    handleRolleSpeichern,
    handleSportSpeichern,
    parseIsoDateTime,
    renderConfigSeite,
    renderEinstellungen,
    renderEventFormular,
    renderKanalFormular,
    renderLogs,
    renderMeilensteinListe,
    renderMorgengrussLernen,
    renderRollenFormular,
    renderSportAdmin,
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
        expect(html).toContain('action="/config/kanal"');
        expect(html).toContain('name="feld" value="protokoll"');
        expect(html).toContain(createCsrfToken('12345'));
        expect(html).toContain('value="c1" selected');
        // Rollen-Formular mit "— keine —" und vorausgewählter Rolle
        expect(html).toContain('action="/config/rolle"');
        expect(html).toContain('— keine —');
        expect(html).toContain('value="r1" selected');
        // Event-Formular mit vorausgefüllten Datums-/Zeit-Feldern
        expect(html).toContain('action="/config/event"');
        expect(html).toContain('value="2026-12-24"');
        expect(html).toContain('value="18:00"');
        // Sport-Admin-Block
        expect(html).toContain('action="/config/sport"');
        expect(html).toContain('Kilometerstand eines Mitglieds setzen');
        expect(html).toContain('aktuell 1250 km');
        // Meilenstein-Liste
        expect(html).toContain('1000 km');
        expect(html).toContain('value="meilenstein-entfernen"');
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

    it('renderKanalFormular escaped Kanalnamen, markiert den aktuellen Kanal und trägt die Feld-Kennung', () => {
        const html = renderKanalFormular(
            {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'b'},
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
        expect(html).toContain('action="/config/rolle"');
    });

    it('renderRollenFormular markiert "— keine —" wenn keine Rolle gesetzt ist', () => {
        const html = renderRollenFormular([{id: 'r1', name: 'Abo'}], null, 'token-9');
        expect(html).toContain('value="" selected>— keine —');
    });

    describe('parseIsoDateTime', () => {
        it('baut einen Timestamp aus Datum + Uhrzeit', () => {
            const ts = parseIsoDateTime('2026-12-24', '18:30');
            expect(ts).toBe(new Date(2026, 11, 24, 18, 30).getTime());
        });

        it('nimmt Mitternacht, wenn keine Uhrzeit angegeben ist', () => {
            const ts = parseIsoDateTime('2026-12-24', '');
            expect(ts).toBe(new Date(2026, 11, 24, 0, 0).getTime());
        });

        it('lehnt inkonsistente/ungültige Werte ab (Round-Trip)', () => {
            expect(parseIsoDateTime('2026-02-31', '12:00')).toBeNull(); // 31. Februar gibt es nicht
            expect(parseIsoDateTime('quatsch', '12:00')).toBeNull();
            expect(parseIsoDateTime('2026-12-24', '25:00')).toBeNull(); // Stunde > 23
            expect(parseIsoDateTime('2026-12-24', '12:99')).toBeNull(); // Minute > 59
        });
    });

    describe('handleEventSpeichern', () => {
        const anfrage = (body: Record<string, string>) => mockRequest({body});

        it('speichert ein zukünftiges Event und leitet zurück', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleEventSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'speichern', datum: '2099-12-31', uhrzeit: '20:00', titel: 'Silvester'}), res
            );

            expect(settings.speichereEventDaten).toHaveBeenCalledWith(new Date(2099, 11, 31, 20, 0).getTime(), 'Silvester');
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('entfernt das Event bei aktion=entfernen', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleEventSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'entfernen'}), res
            );

            expect(settings.entferneEvent).toHaveBeenCalledTimes(1);
            expect(settings.speichereEventDaten).not.toHaveBeenCalled();
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('lehnt ein fehlendes CSRF-Token ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleEventSpeichern(anfrage({aktion: 'entfernen'}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(settings.entferneEvent).not.toHaveBeenCalled();
        });

        it('lehnt ein Datum in der Vergangenheit ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleEventSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'speichern', datum: '2020-01-01', uhrzeit: '12:00'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereEventDaten).not.toHaveBeenCalled();
        });

        it('lehnt ein ungültiges Datum ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleEventSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'speichern', datum: '', uhrzeit: ''}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereEventDaten).not.toHaveBeenCalled();
        });
    });

    it('renderEventFormular füllt Datum/Uhrzeit/Titel vor und escaped den Titel', () => {
        const html = renderEventFormular({datum: '2026-12-24', uhrzeit: '18:00', titel: '<b>Fest</b>'}, 'token-e');
        expect(html).toContain('action="/config/event"');
        expect(html).toContain('type="date" name="datum" value="2026-12-24"');
        expect(html).toContain('value="18:00"');
        expect(html).toContain('&lt;b&gt;Fest&lt;/b&gt;');
        expect(html).toContain('value="entfernen"');
    });

    describe('handleSportSpeichern', () => {
        const anfrage = (body: Record<string, string>) => mockRequest({body});

        it('setzt den Kilometerstand eines gültigen Mitglieds', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleSportSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'kilometer-setzen', mitglied: 'm1', kilometer: '42'}), res
            );

            expect(settings.speichereKilometer).toHaveBeenCalledWith('m1', 42);
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('lehnt ein unbekanntes Mitglied ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleSportSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'kilometer-setzen', mitglied: 'fremd', kilometer: '42'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereKilometer).not.toHaveBeenCalled();
        });

        it('lehnt eine ungültige Kilometerangabe ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleSportSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'kilometer-setzen', mitglied: 'm1', kilometer: '-5'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereKilometer).not.toHaveBeenCalled();
        });

        it('addiert bzw. setzt Bestandskilometer', async () => {
            const res1 = mockResponse();
            res1.locals.configUserId = '12345';
            await handleSportSpeichern(anfrage({_csrf: createCsrfToken('12345'), aktion: 'altkilometer-addieren', kilometer: '10'}), res1);
            expect(settings.addiereLegacyKilometer).toHaveBeenCalledWith(10);

            const res2 = mockResponse();
            res2.locals.configUserId = '12345';
            await handleSportSpeichern(anfrage({_csrf: createCsrfToken('12345'), aktion: 'altkilometer-setzen', kilometer: '0'}), res2);
            expect(settings.setzeLegacyKilometer).toHaveBeenCalledWith(0);
        });

        it('entfernt einen Meilenstein', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleSportSpeichern(anfrage({_csrf: createCsrfToken('12345'), aktion: 'meilenstein-entfernen', kilometer: '2000'}), res);

            expect(settings.entferneMeilenstein).toHaveBeenCalledWith(2000);
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=1');
        });

        it('lehnt ein fehlendes CSRF-Token ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleSportSpeichern(anfrage({aktion: 'kilometer-setzen', mitglied: 'm1', kilometer: '42'}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(settings.speichereKilometer).not.toHaveBeenCalled();
        });

        it('lehnt eine unbekannte Aktion ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleSportSpeichern(anfrage({_csrf: createCsrfToken('12345'), aktion: 'quatsch', kilometer: '5'}), res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    it('renderSportAdmin zeigt Mitglied-Dropdown und den aktuellen Bestandskilometer-Wert', () => {
        const html = renderSportAdmin([{id: 'm1', name: 'Tirsis'}], 1250, 'token-s');
        expect(html).toContain('action="/config/sport"');
        expect(html).toContain('value="m1"');
        expect(html).toContain('Tirsis');
        expect(html).toContain('aktuell 1250 km');
        expect(html).toContain('value="altkilometer-addieren"');
        expect(html).toContain('value="altkilometer-setzen"');
    });

    it('renderMeilensteinListe zeigt Meilensteine sortiert mit Entfernen und escaped den Text', () => {
        const html = renderMeilensteinListe([
            {kilometers: 2000, text: 'Zwei<b>tausend</b>', announced: false},
            {kilometers: 1000, text: 'Tausend', announced: true},
        ], 'token-m');
        // nach km aufsteigend sortiert -> 1000 vor 2000
        expect(html.indexOf('1000 km')).toBeLessThan(html.indexOf('2000 km'));
        expect(html).toContain('&lt;b&gt;tausend&lt;/b&gt;');
        expect(html).not.toContain('Zwei<b>tausend</b>');
        expect(html).toContain('value="meilenstein-entfernen"');
        expect(html).toContain('(angekündigt)');
    });

    it('renderMeilensteinListe meldet, wenn keine Meilensteine da sind', () => {
        expect(renderMeilensteinListe([], 'token-m')).toContain('Noch keine Meilensteine');
    });

    describe('handleMorgengrussLernen', () => {
        const anfrage = (body: Record<string, string>) => mockRequest({body});

        it('stößt den Historien-Scan an und meldet die Anzahl zurück', async () => {
            (greetingHandler.lerneAusHistorie as any).mockResolvedValue(3);
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussLernen(anfrage({_csrf: createCsrfToken('12345')}), res);

            expect(greetingHandler.lerneAusHistorie).toHaveBeenCalledTimes(1);
            expect(res.redirect).toHaveBeenCalledWith('/config?gelernt=3');
        });

        it('leitet auf den kein-Kanal-Hinweis, wenn kein Kanal gesetzt ist', async () => {
            (greetingHandler.lerneAusHistorie as any).mockResolvedValue(null);
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussLernen(anfrage({_csrf: createCsrfToken('12345')}), res);

            expect(res.redirect).toHaveBeenCalledWith('/config?morgengruss=kein-kanal');
        });

        it('lehnt ein fehlendes CSRF-Token ab und scannt nicht', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussLernen(anfrage({}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(greetingHandler.lerneAusHistorie).not.toHaveBeenCalled();
        });
    });

    it('handleConfigPage zeigt die Lern-Rückmeldung (Zahl aus der Query, kein XSS)', async () => {
        const res = mockResponse();
        res.locals.configUserId = '12345';

        await handleConfigPage(mockRequest({query: {gelernt: '5'}}), res);

        expect(res.send.mock.calls[0][0]).toContain('5 persönliche Emojis gelernt');
    });

    it('renderMorgengrussLernen baut den Lern-Button mit CSRF-Token', () => {
        const html = renderMorgengrussLernen('token-mg');
        expect(html).toContain('action="/config/morgengruss"');
        expect(html).toContain('value="token-mg"');
    });

    it('renderConfigSeite baut die vollständige Seite (Einstellungen + beide Formular-Arten)', () => {
        const html = renderConfigSeite({
            einstellungen: [{label: 'Protokoll-Kanal', wert: '#log', status: 'ok'}],
            kanalFelder: [{schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'c1'}],
            kanaele: [{id: 'c1', name: 'allgemein'}],
            rollen: [{id: 'r1', name: 'Streamer'}],
            twitchRolleId: 'r1',
            eventFelder: {datum: '2026-12-24', uhrzeit: '18:00', titel: 'Fest'},
            mitglieder: [{id: 'm1', name: 'Tirsis'}],
            legacyKilometer: 1250,
            meilensteine: [{kilometers: 1000, text: 'Tausend!', announced: false}],
            csrfToken: 'tok',
            gespeichert: true,
        });
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('Gespeichert.');
        expect(html).toContain('action="/config/kanal"');
        expect(html).toContain('action="/config/rolle"');
        expect(html).toContain('action="/config/event"');
        expect(html).toContain('action="/config/sport"');
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

    describe('Log-Ansicht', () => {
        it('renderLogs escaped den Log-Text (kein XSS) und markiert das Level', () => {
            const html = renderLogs([
                {zeit: Date.parse('2026-07-26T08:30:15'), level: 'error', text: 'Fehler bei <script>böse</script>'},
            ]);
            expect(html).toContain('&lt;script&gt;böse&lt;/script&gt;');
            expect(html).not.toContain('<script>böse</script>');
            expect(html).toContain('class="error"');
            expect(html).toContain('08:30:15');
        });

        it('renderLogs meldet einen leeren Puffer', () => {
            expect(renderLogs([])).toContain('Noch keine Log-Zeilen');
        });

        it('handleLogs rendert die gepufferten Zeilen', () => {
            (logBuffer.getLogEntries as any).mockReturnValue([
                {zeit: Date.now(), level: 'log', text: 'eine Zeile'},
            ]);
            const res = mockResponse();

            handleLogs(mockRequest(), res);

            expect(res.send.mock.calls[0][0]).toContain('eine Zeile');
        });
    });

    it('handleConfigPage verlinkt die Log-Ansicht', async () => {
        const res = mockResponse();
        res.locals.configUserId = '12345';

        await handleConfigPage(mockRequest(), res);

        expect(res.send.mock.calls[0][0]).toContain('href="/config/logs"');
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
