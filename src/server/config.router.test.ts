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
    holeTextKanaele: vi.fn(() => [{id: 'c1', name: 'allgemein'}]),
    ladeKanalFelder: vi.fn(() => Promise.resolve([
        {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'c1', status: 'ok'}
    ])),
    istGueltigerTextKanal: vi.fn((id: string) => id === 'c1'),
    istKanalFeld: vi.fn((feld: string) => feld === 'protokoll'),
    speichereKanal: vi.fn(() => Promise.resolve()),
    holeRollen: vi.fn(() => [{id: 'r1', name: 'Abonnenten'}]),
    ladeRollenFelder: vi.fn(() => Promise.resolve([
        {schluessel: 'twitch-rolle', label: 'Twitch-Benachrichtigungsrolle', aktuelleId: 'r1', status: 'ok'},
    ])),
    istRollenFeld: vi.fn((schluessel: string) => ['twitch-rolle', 'pingpong-champion'].includes(schluessel)),
    istGueltigeRolle: vi.fn((id: string) => id === 'r1'),
    speichereRolle: vi.fn(() => Promise.resolve()),
    holeEventFelder: vi.fn(() => Promise.resolve({datum: '2026-12-24', uhrzeit: '18:00', titel: 'Weihnachtstreffen'})),
    speichereEventDaten: vi.fn(() => Promise.resolve()),
    entferneEvent: vi.fn(() => Promise.resolve()),
    holeMitglieder: vi.fn(async () => [{id: 'm1', name: 'Tirsis', kilometer: 128.5}]),
    holeMorgengrussEmojis: vi.fn(async () => [{id: 'm1', name: 'Tirsis', herkunft: 'gelernt', emoji: {art: 'unicode', zeichen: '🦊'}, eingabeWert: '🦊'}]),
    holeEmojiVorschlaege: vi.fn(async () => ['🦊', ':blahaj:']),
    deuteEmojiEingabe: vi.fn((e: string) => (e === 'ungueltig' || e === '' ? null : e)),
    speichereMorgengrussEmoji: vi.fn(async () => undefined),
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
import {createCsrfToken, signSession, verifyCsrfToken, SESSION_COOKIE, STATE_COOKIE} from './config.session.js';
import {
    escapeHtml,
    handleCallback,
    handleConfigPage,
    handleEventSpeichern,
    handleKanalSpeichern,
    handleLogin,
    handleLogout,
    handleLogs,
    handleMorgengrussEmojiSeite,
    handleMorgengrussEmojiSpeichern,
    handleMorgengrussLernen,
    handleRolleSpeichern,
    handleSportSpeichern,
    parseIsoDateTime,
    leseMeldung,
    renderConfigSeite,
    renderEventFormular,
    renderKanalFormular,
    renderLogs,
    renderMeilensteinListe,
    renderMorgengrussEmojiLink,
    renderMorgengrussEmojis,
    renderGeburtstagHinweis,
    renderMorgengrussLernen,
    renderRollenFormular,
    renderSportAdmin,
    requireConfigAuth,
    setzeAdminHeader
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

const VORSCHLAEGE = ['🦊', ':blahaj:'];

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

        // Bei GET ist die Login-Seite mit 200 die normale Einstiegsseite. Bei POST hat gerade jemand
        // ein Formular abgeschickt - ein 200 mit Login-HTML sähe aus, als hätte das Speichern geklappt.
        it('antwortet bei POST ohne Session mit 401 und sagt, dass nichts gespeichert wurde', async () => {
            const req = mockRequest();
            req.method = 'POST';
            const res = mockResponse();
            const next = vi.fn();

            await requireConfigAuth(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.send.mock.calls[0][0]).toContain('nicht');
            expect(res.send.mock.calls[0][0]).toContain('Sitzung abgelaufen');
        });

        it('antwortet bei GET ohne Session weiterhin mit der Login-Seite (kein Fehlerstatus)', async () => {
            const req = mockRequest();
            req.method = 'GET';
            const res = mockResponse();

            await requireConfigAuth(req, res, vi.fn());

            expect(res.status).not.toHaveBeenCalled();
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
        // Bereiche als Sprungziele für den Redirect nach dem Speichern
        expect(html).toContain('id="bereich-sport"');
        expect(html).toContain('id="bereich-event"');
        // Kanal-Formular inkl. CSRF-Token, Feld-Kennung und vorausgewähltem Kanal
        expect(html).toContain('action="/config/kanal"');
        expect(html).toContain('name="feld" value="protokoll"');
        // Das Token traegt seit 2026-07-26 einen Ablauf, ist also nicht mehr Zeichen-fuer-Zeichen
        // vorhersagbar - deshalb aus dem HTML lesen und pruefen lassen.
        const token = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
        expect(verifyCsrfToken('12345', token)).toBe(true);
        expect(verifyCsrfToken('99999', token)).toBe(false);
        expect(html).toContain('value="c1" selected');
        // Rollen-Formular mit "— keine —" und vorausgewählter Rolle
        expect(html).toContain('action="/config/rolle"');
        // Die Feld-Kennung sagt der Route, WELCHE Rollen-Einstellung gemeint ist.
        expect(html).toContain('name="feld" value="twitch-rolle"');
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

    // Die Rückmeldung sagt WAS gespeichert wurde und steht im betroffenen Bereich - bis 2026-07-26
    // war es ein anonymes "Gespeichert." ganz oben, bei zehn Formularen auf der Seite nutzlos.
    it('handleConfigPage zeigt die Rückmeldung im betroffenen Bereich', async () => {
        const res = mockResponse();
        res.locals.configUserId = '12345';

        await handleConfigPage(mockRequest({query: {gespeichert: 'kilometer-setzen'}}), res);

        const html = res.send.mock.calls[0][0] as string;
        expect(html).toContain('Kilometerstand gesetzt.');
        // ... und zwar im Sport-Bereich, nicht irgendwo sonst.
        const sportBereich = html.slice(html.indexOf('id="bereich-sport"'), html.indexOf('id="bereich-protokoll"'));
        expect(sportBereich).toContain('Kilometerstand gesetzt.');
    });

    describe('leseMeldung', () => {
        it('übersetzt einen bekannten Schlüssel in Text + Bereich', () => {
            expect(leseMeldung(mockRequest({query: {gespeichert: 'twitch-rolle-entfernt'}}) as any)).toEqual({
                bereich: 'twitch',
                text: 'Twitch-Benachrichtigungsrolle entfernt.',
                art: 'ok',
            });
        });

        it('ignoriert unbekannte und Prototyp-Schlüssel (der Wert wird nie ausgegeben)', () => {
            expect(leseMeldung(mockRequest({query: {gespeichert: 'quatsch'}}) as any)).toBeUndefined();
            expect(leseMeldung(mockRequest({query: {gespeichert: '__proto__'}}) as any)).toBeUndefined();
            expect(leseMeldung(mockRequest({query: {gespeichert: 'constructor'}}) as any)).toBeUndefined();
            expect(leseMeldung(mockRequest() as any)).toBeUndefined();
        });

        it('meldet die gelernten Emojis als Zahl im Morgengruß-Bereich', () => {
            expect(leseMeldung(mockRequest({query: {gelernt: '3'}}) as any)).toEqual({
                bereich: 'morgengruss',
                text: 'Aus der Historie habe ich 3 persönliche Emojis gelernt.',
                art: 'ok',
            });
        });

        it('nimmt keine rohe Query in den Text (kein XSS über ?gelernt=)', () => {
            expect(leseMeldung(mockRequest({query: {gelernt: '<script>'}}) as any)).toBeUndefined();
        });

        it('meldet den fehlenden Morgengruß-Kanal als Warnung', () => {
            expect(leseMeldung(mockRequest({query: {morgengruss: 'kein-kanal'}}) as any)?.art).toBe('warnung');
        });
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
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=protokoll#bereich-protokoll');
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
            {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'b', status: 'ok'},
            [{id: 'a', name: '<böse>'}, {id: 'b', name: 'log'}],
            'token-123'
        );
        expect(html).toContain('&lt;böse&gt;');
        expect(html).not.toContain('<böse>');
        expect(html).toContain('value="b" selected');
        expect(html).toContain('value="token-123"');
        expect(html).toContain('name="feld" value="protokoll"');
        // Bei 'ok' ist der echte Kanal vorausgewählt - kein Platzhalter davor.
        expect(html).not.toContain('disabled');
    });

    // Ein <select> selektiert immer irgendetwas: ohne Platzhalter stünde bei "nicht gesetzt" der
    // erste Kanal im Feld und sähe aus, als wäre er konfiguriert. Bis 2026-07-26 war das so - die
    // read-only-Tabelle darüber verdeckte es.
    it('renderKanalFormular wählt bei "nicht gesetzt" keinen Kanal vor', () => {
        const html = renderKanalFormular(
            {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: null, status: 'leer'},
            [{id: 'a', name: 'allgemein'}, {id: 'b', name: 'log'}],
            'token-123'
        );
        expect(html).toContain('<option value="" disabled selected>— nicht gesetzt —</option>');
        expect(html).not.toContain('selected>#allgemein');
        expect(html).toContain('required');
    });

    it('renderKanalFormular macht einen gelöschten Kanal mit seiner ID sichtbar', () => {
        const html = renderKanalFormular(
            {schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'weg-123', status: 'warnung'},
            [{id: 'a', name: 'allgemein'}],
            'token-123'
        );
        expect(html).toContain('disabled selected');
        expect(html).toContain('weg-123');
        expect(html).toContain('nicht abrufbar');
        expect(html).toContain('status-warnung');
    });

    describe('handleRolleSpeichern', () => {
        const gueltigeAnfrage = (body: Record<string, string>) => mockRequest({body});

        it('speichert eine gültige Rolle und leitet zurück', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'twitch-rolle', rolle: 'r1'}), res
            );

            expect(settings.speichereRolle).toHaveBeenCalledWith('twitch-rolle', 'r1');
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=twitch-rolle#bereich-twitch');
        });

        it('entfernt die Rolle bei leerem Wert (— keine —)', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'twitch-rolle', rolle: ''}), res
            );

            expect(settings.speichereRolle).toHaveBeenCalledWith('twitch-rolle', null);
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=twitch-rolle-entfernt#bereich-twitch');
        });

        it('lehnt ein fehlendes CSRF-Token ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(gueltigeAnfrage({feld: 'twitch-rolle', rolle: 'r1'}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(settings.speichereRolle).not.toHaveBeenCalled();
        });

        it('speichert auch die Ping-Pong-Champion-Rolle über dasselbe Formularfeld', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'pingpong-champion', rolle: 'r1'}), res
            );

            expect(settings.speichereRolle).toHaveBeenCalledWith('pingpong-champion', 'r1');
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=pingpong-champion#bereich-pingpong');
        });

        it('lehnt eine unbekannte Feld-Kennung ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'ausgedacht', rolle: 'r1'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereRolle).not.toHaveBeenCalled();
        });

        it('lehnt eine unbekannte Rolle ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleRolleSpeichern(
                gueltigeAnfrage({_csrf: createCsrfToken('12345'), feld: 'twitch-rolle', rolle: 'fremde-rolle'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereRolle).not.toHaveBeenCalled();
        });
    });

    it('renderRollenFormular bietet "— keine —" und markiert die aktuelle Rolle', () => {
        const html = renderRollenFormular(
            [{id: 'r1', name: '<b>Abo</b>'}, {id: 'r2', name: 'Zuschauer'}],
            {schluessel: 'twitch-rolle', label: 'Twitch-Benachrichtigungsrolle', aktuelleId: 'r2', status: 'ok'}, 'token-9'
        );
        expect(html).toContain('— keine —');
        expect(html).toContain('&lt;b&gt;Abo&lt;/b&gt;');
        expect(html).not.toContain('<b>Abo</b>');
        expect(html).toContain('value="r2" selected');
        expect(html).toContain('action="/config/rolle"');
        // Die Feld-Kennung sagt der Route, WELCHE Rollen-Einstellung gemeint ist.
        expect(html).toContain('name="feld" value="twitch-rolle"');
    });

    it('renderRollenFormular markiert "— keine —" wenn keine Rolle gesetzt ist', () => {
        const html = renderRollenFormular([{id: 'r1', name: 'Abo'}], {schluessel: 'twitch-rolle', label: 'Twitch-Benachrichtigungsrolle', aktuelleId: null, status: 'leer'}, 'token-9');
        expect(html).toContain('value="" selected>— keine —');
        // "keine Rolle" ist ein gültiger Zustand - kein disabled-Platzhalter davor.
        expect(html).not.toContain('disabled');
    });

    // Zeigt die gespeicherte ID im Klartext, wenn die Rolle gelöscht wurde: sie steht nicht in der
    // Optionsliste, der kaputte Zustand wäre sonst unsichtbar (das Feld sähe leer aus).
    it('renderRollenFormular macht eine gelöschte Rolle sichtbar', () => {
        const html = renderRollenFormular([{id: 'r1', name: 'Abo'}], {schluessel: 'twitch-rolle', label: 'Twitch-Benachrichtigungsrolle', aktuelleId: 'r-weg', status: 'warnung'}, 'token-9');
        expect(html).toContain('disabled selected');
        expect(html).toContain('r-weg');
        expect(html).toContain('nicht abrufbar');
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
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=event#bereich-event');
        });

        it('entfernt das Event bei aktion=entfernen', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleEventSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), aktion: 'entfernen'}), res
            );

            expect(settings.entferneEvent).toHaveBeenCalledTimes(1);
            expect(settings.speichereEventDaten).not.toHaveBeenCalled();
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=event-entfernt#bereich-event');
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
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=kilometer-setzen#bereich-sport');
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
            expect(res.redirect).toHaveBeenCalledWith('/config?gespeichert=meilenstein-entfernen#bereich-sport');
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
        const html = renderSportAdmin([{id: 'm1', name: 'Tirsis', kilometer: 128.5}], 1250, 'token-s');
        expect(html).toContain('action="/config/sport"');
        expect(html).toContain('value="m1"');
        expect(html).toContain('Tirsis');
        expect(html).toContain('aktuell 1250 km');
        expect(html).toContain('value="altkilometer-addieren"');
        expect(html).toContain('value="altkilometer-setzen"');
    });

    // Das Setzen überschreibt fremde Kilometer unwiederbringlich - die drei Bremsen dagegen
    // (aktueller Stand sichtbar, nichts vorausgewählt, Rückfrage) sind hier festgenagelt.
    it('renderSportAdmin nennt den aktuellen Kilometerstand je Mitglied', () => {
        const html = renderSportAdmin([
            {id: 'm1', name: 'Tirsis', kilometer: 128.5},
            {id: 'm2', name: 'Zerix', kilometer: 0},
        ], 0, 'token-s');
        expect(html).toContain('Tirsis (128.5 km)');
        expect(html).toContain('Zerix (0 km)');
    });

    it('renderSportAdmin rundet Float-Reste im Kilometerstand auf zwei Stellen', () => {
        const html = renderSportAdmin([{id: 'm1', name: 'Tirsis', kilometer: 12.340000000000002}], 0, 'token-s');
        expect(html).toContain('Tirsis (12.34 km)');
    });

    it('renderSportAdmin wählt kein Mitglied vor und fragt vor dem Überschreiben nach', () => {
        const html = renderSportAdmin([{id: 'm1', name: 'Tirsis', kilometer: 5}], 0, 'token-s');
        expect(html).toContain('<option value="" selected>— Mitglied wählen —</option>');
        expect(html).not.toContain('value="m1" selected');
        expect(html).toContain('confirm(');
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
            expect(res.redirect).toHaveBeenCalledWith('/config?gelernt=3#bereich-morgengruss');
        });

        it('leitet auf den kein-Kanal-Hinweis, wenn kein Kanal gesetzt ist', async () => {
            (greetingHandler.lerneAusHistorie as any).mockResolvedValue(null);
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussLernen(anfrage({_csrf: createCsrfToken('12345')}), res);

            expect(res.redirect).toHaveBeenCalledWith('/config?morgengruss=kein-kanal#bereich-morgengruss');
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

    describe('renderMorgengrussEmojis', () => {
        it('zeigt Name, Emoji und Herkunft je Mitglied', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Tirsis', herkunft: 'gelernt', emoji: {art: 'unicode', zeichen: '🦊'}, eingabeWert: '🦊'},
                {id: 'm2', name: 'Acaine', herkunft: 'abgeleitet', emoji: {art: 'unicode', zeichen: '🌿'}, eingabeWert: '🌿'},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('Tirsis');
            expect(html).toContain('🦊');
            expect(html).toContain('gelernt');
            expect(html).toContain('abgeleitet');
        });

        // Der dritte Zustand muss sich von „gelernt" unterscheiden lassen: nur an ihm sieht man,
        // welche Zeilen der Lern-Button in Ruhe lässt.
        it('weist von Hand gesetzte Emojis als manuell aus', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Tirsis', herkunft: 'manuell', emoji: {art: 'unicode', zeichen: '🍪'}, eingabeWert: '🍪'},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('>manuell</td>');
            expect(html).not.toContain('>gelernt</td>');
            expect(html).not.toContain('>abgeleitet</td>');
        });

        // Discord-Markup (<:name:id>) rendert nur in Discord - im Browser braucht es ein <img>.
        it('rendert Custom-Emojis als Bild', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Zerix', herkunft: 'gelernt', emoji: {art: 'custom', url: 'https://cdn/1.png', name: 'blahaj'}, eingabeWert: ':blahaj:'},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('<img class="emoji" src="https://cdn/1.png"');
            expect(html).toContain('alt="blahaj"');
        });

        // Gelernt, aber das Server-Emoji ist weg: message.react würde damit scheitern, das gehört
        // sichtbar gemacht statt als leere Zelle verschluckt.
        it('macht ein gelöschtes Server-Emoji sichtbar', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Wer', herkunft: 'gelernt', emoji: {art: 'unbekannt', id: '999'}, eingabeWert: ''},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('gelöscht');
            expect(html).toContain('status-warnung');
        });

        it('escaped Namen und Emoji-Werte (kein XSS)', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: '<b>böse</b>', herkunft: 'gelernt', emoji: {art: 'custom', url: '"><script>', name: '<i>x</i>'}, eingabeWert: ':blahaj:'},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('&lt;b&gt;böse&lt;/b&gt;');
            expect(html).not.toContain('<b>böse</b>');
            expect(html).not.toContain('<script>');
        });

        it('meldet, wenn keine Mitglieder da sind', () => {
            expect(renderMorgengrussEmojis([], VORSCHLAEGE, 'tok')).toContain('Keine Mitglieder gefunden');
        });

        it('baut je Zeile ein Textfeld mit dem aktuellen Wert', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Tirsis', herkunft: 'gelernt', emoji: {art: 'unicode', zeichen: '🦊'}, eingabeWert: '🦊'},
            ], VORSCHLAEGE, 'tok-e');
            expect(html).toContain('action="/config/morgengruss-emoji"');
            expect(html).toContain('name="mitglied" value="m1"');
            expect(html).toContain('value="tok-e"');
            expect(html).toContain('name="emoji"');
            expect(html).toContain('value="🦊"');
        });

        // Freitext statt Dropdown: die Liste ist nur ein Vorschlag, sonst wären gängige Emojis
        // (🍪) nicht setzbar - genau daran ist die geschlossene Auswahl gescheitert.
        it('bietet die Vorschläge als datalist an, ohne die Eingabe einzuschränken', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Tirsis', herkunft: 'gelernt', emoji: {art: 'unicode', zeichen: '🦊'}, eingabeWert: '🦊'},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('<datalist id="emoji-vorschlaege">');
            expect(html).toContain('<option value=":blahaj:"></option>');
            expect(html).toContain('list="emoji-vorschlaege"');
            // Kein <select> mehr - das war die geschlossene Auswahl.
            expect(html).not.toContain('<select');
        });

        it('rendert die datalist nur einmal, nicht je Zeile', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'A', herkunft: 'gelernt', emoji: {art: 'unicode', zeichen: '🦊'}, eingabeWert: '🦊'},
                {id: 'm2', name: 'B', herkunft: 'gelernt', emoji: {art: 'unicode', zeichen: '🌿'}, eingabeWert: '🌿'},
            ], VORSCHLAEGE, 'tok');
            expect(html.match(/<datalist/g)).toHaveLength(1);
        });

        // Bei kaputter Zuordnung gibt es nichts sinnvoll vorzugeben - leeres Pflichtfeld statt
        // eines unbrauchbaren Werts.
        it('lässt das Feld leer, wenn das Server-Emoji weg ist', () => {
            const html = renderMorgengrussEmojis([
                {id: 'm1', name: 'Wer', herkunft: 'gelernt', emoji: {art: 'unbekannt', id: '999'}, eingabeWert: ''},
            ], VORSCHLAEGE, 'tok');
            expect(html).toContain('value=""');
            expect(html).toContain('required');
            expect(html).not.toContain('value="999"');
        });
    });

    // Die Tabelle wächst mit der Mitgliederzahl und hätte /config sonst dominiert - sie liegt
    // deshalb auf einer eigenen Seite (Muster wie /config/logs).
    describe('ausgelagerte Emoji-Seite', () => {
        it('verlinkt sie aus dem Morgengruß-Bereich statt die Tabelle einzubetten', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleConfigPage(mockRequest(), res);

            const html = res.send.mock.calls[0][0] as string;
            expect(html).toContain('href="/config/morgengruss-emojis"');
            expect(html).not.toContain('action="/config/morgengruss-emoji"');
            // Die Hauptseite lädt die Emoji-Daten gar nicht mehr.
            expect(settings.holeMorgengrussEmojis).not.toHaveBeenCalled();
            expect(settings.holeEmojiVorschlaege).not.toHaveBeenCalled();
        });

        it('renderMorgengrussEmojiLink nennt die Anzahl im richtigen Numerus', () => {
            expect(renderMorgengrussEmojiLink(1)).toContain('1 Person');
            expect(renderMorgengrussEmojiLink(4)).toContain('4 Personen');
        });

        it('handleMorgengrussEmojiSeite rendert Tabelle und Rückweg', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSeite(mockRequest(), res);

            const html = res.send.mock.calls[0][0] as string;
            expect(html).toContain('Persönliche Morgengruß-Emojis');
            expect(html).toContain('action="/config/morgengruss-emoji"');
            expect(html).toContain('Tirsis');
            expect(html).toContain('href="/config"');
            // Ohne ?gespeichert keine Erfolgsmeldung.
            expect(html).not.toContain('Persönliches Emoji gespeichert.');
        });

        it('handleMorgengrussEmojiSeite zeigt die Rückmeldung nach dem Speichern', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSeite(mockRequest({query: {gespeichert: '1'}}), res);

            expect(res.send.mock.calls[0][0]).toContain('Persönliches Emoji gespeichert.');
        });

        it('handleMorgengrussEmojiSeite bleibt bei einem Redis-Fehler bedienbar', async () => {
            (settings.holeMorgengrussEmojis as any).mockRejectedValueOnce(new Error('Redis weg'));
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSeite(mockRequest(), res);

            const html = res.send.mock.calls[0][0] as string;
            expect(html).toContain('konnte gerade nicht geladen werden');
            expect(html).toContain('href="/config"');
        });
    });

    describe('handleMorgengrussEmojiSpeichern', () => {
        const anfrage = (body: Record<string, string>) => mockRequest({body});

        beforeEach(() => {
            // Standard: die Eingabe wird unverändert übernommen (siehe Mock oben).
            (settings.deuteEmojiEingabe as any).mockImplementation((e: string) => (e === 'ungueltig' || e === '' ? null : e));
        });

        it('speichert ein gültiges Emoji und bleibt auf der Emoji-Seite', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), mitglied: 'm1', emoji: '🦊'}), res
            );

            expect(settings.speichereMorgengrussEmoji).toHaveBeenCalledWith('m1', '🦊');
            // Zurück auf die ausgelagerte Seite, nicht auf /config - dort hat man ja gearbeitet.
            expect(res.redirect).toHaveBeenCalledWith('/config/morgengruss-emojis?gespeichert=1');
        });

        it('lehnt ein fehlendes CSRF-Token ab und speichert nicht', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(anfrage({mitglied: 'm1', emoji: '🦊'}), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(settings.speichereMorgengrussEmoji).not.toHaveBeenCalled();
        });

        it('lehnt ein unbekanntes Mitglied ab', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), mitglied: 'fremd', emoji: '🦊'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereMorgengrussEmoji).not.toHaveBeenCalled();
        });

        // Freitext heißt NICHT beliebig: deuteEmojiEingabe entscheidet, was durchkommt. Text würde
        // beim Gruß sonst still an message.react scheitern.
        it('lehnt ab, was deuteEmojiEingabe verwirft', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), mitglied: 'm1', emoji: 'ungueltig'}), res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(settings.speichereMorgengrussEmoji).not.toHaveBeenCalled();
        });

        // Ein :name: wird zur ID aufgelöst - gespeichert wird das Ergebnis, nicht die Eingabe.
        it('speichert den gedeuteten Wert, nicht die Rohe Eingabe', async () => {
            (settings.deuteEmojiEingabe as any).mockReturnValue('555');
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), mitglied: 'm1', emoji: ':blahaj:'}), res
            );

            expect(settings.speichereMorgengrussEmoji).toHaveBeenCalledWith('m1', '555');
        });

        // Der Zurück-Link jeder Absage muss auf die Emoji-Liste zeigen, nicht auf /config: wer hier
        // scheitert, hat auf der Unterseite gearbeitet und will genau dorthin zurück.
        it.each([
            ['fehlendes CSRF-Token', {mitglied: 'm1', emoji: '🦊'}],
            ['unbekanntes Mitglied', {_csrf: createCsrfToken('12345'), mitglied: 'fremd', emoji: '🦊'}],
            ['verworfenes Emoji', {_csrf: createCsrfToken('12345'), mitglied: 'm1', emoji: 'ungueltig'}],
        ])('führt bei %s zurück auf die Emoji-Liste', async (_fall, body) => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(anfrage(body as Record<string, string>), res);

            expect(res.send.mock.calls[0][0]).toContain('href="/config/morgengruss-emojis"');
        });

        // Eine abgelehnte Eingabe ist kein Rechteproblem - "Kein Zugriff" widerspräche dem Text
        // darunter ("Das ist kein Emoji, das ich setzen kann").
        it('betitelt eine abgelehnte Eingabe nicht als fehlenden Zugriff', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(
                anfrage({_csrf: createCsrfToken('12345'), mitglied: 'm1', emoji: 'ungueltig'}), res
            );

            const html = res.send.mock.calls[0][0] as string;
            expect(html).toContain('Eingabe nicht übernommen');
            expect(html).not.toContain('Kein Zugriff');
        });

        // Ein ungültiges CSRF-Token ist dagegen sehr wohl ein Zugriffsproblem.
        it('betitelt ein fehlendes CSRF-Token weiterhin als fehlenden Zugriff', async () => {
            const res = mockResponse();
            res.locals.configUserId = '12345';

            await handleMorgengrussEmojiSpeichern(anfrage({mitglied: 'm1', emoji: '🦊'}), res);

            expect(res.send.mock.calls[0][0]).toContain('Kein Zugriff');
        });
    });

    // Im Geburtstags-Bereich gibt es bewusst NUR den Kanal - die Daten tragen die Leute selbst ein.
    it('renderGeburtstagHinweis erklärt, dass nur selbst eingetragen wird', () => {
        const html = renderGeburtstagHinweis();
        expect(html).toContain('/geburtstag setzen');
        expect(html).not.toContain('<form');
    });

    it('renderMorgengrussLernen baut den Lern-Button mit CSRF-Token', () => {
        const html = renderMorgengrussLernen('token-mg');
        expect(html).toContain('action="/config/morgengruss"');
        expect(html).toContain('value="token-mg"');
    });

    const vollstaendigeDaten = () => ({
        kanalFelder: [{schluessel: 'protokoll', label: 'Protokoll-Kanal', aktuelleId: 'c1', status: 'ok' as const}],
        kanaele: [{id: 'c1', name: 'allgemein'}],
        rollen: [{id: 'r1', name: 'Streamer'}],
        rollenFelder: [
            {schluessel: 'twitch-rolle', label: 'Twitch-Benachrichtigungsrolle', aktuelleId: 'r1', status: 'ok' as const},
            {schluessel: 'pingpong-champion', label: 'Champion-Rolle', aktuelleId: null, status: 'leer' as const},
        ],
        eventFelder: {datum: '2026-12-24', uhrzeit: '18:00', titel: 'Fest'},
        mitglieder: [{id: 'm1', name: 'Tirsis', kilometer: 128.5}],
        legacyKilometer: 1250,
        meilensteine: [{kilometers: 1000, text: 'Tausend!', announced: false}],
        anzahlEmojiEintraege: 3,
        csrfToken: 'tok',
    });

    it('renderConfigSeite baut die vollständige Seite (alle Bereiche + Formular-Arten)', () => {
        const html = renderConfigSeite(vollstaendigeDaten());
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('action="/config/kanal"');
        expect(html).toContain('action="/config/rolle"');
        // Die Feld-Kennung sagt der Route, WELCHE Rollen-Einstellung gemeint ist.
        expect(html).toContain('name="feld" value="twitch-rolle"');
        expect(html).toContain('name="feld" value="pingpong-champion"');
        expect(html).toContain('action="/config/event"');
        expect(html).toContain('action="/config/sport"');
        expect(html).toContain('action="/config/morgengruss"');
        // Jeder Bereich hat sein Sprungziel.
        for (const bereich of ['twitch', 'sport', 'protokoll', 'morgengruss', 'geburtstag', 'spielwelt', 'pingpong', 'event']) {
            expect(html).toContain(`id="bereich-${bereich}"`);
        }
        // Ohne Meldung steht keine da.
        expect(html).not.toContain('class="meldung');
    });

    // Der Spielwelt-Bereich hat ausser dem Kanal kein Formular - ohne den Hinweis staende dort
    // ein Dropdown ohne erkennbaren Zweck.
    it('renderConfigSeite erklaert im Spielwelt-Bereich, wofuer der Kanal gut ist', () => {
        const html = renderConfigSeite({
            ...vollstaendigeDaten(),
            kanalFelder: [{schluessel: 'spielwelt-kanal', label: 'Spielwelt-Ankündigungskanal', aktuelleId: 'c1', status: 'ok' as const}],
        });
        const bereich = html.slice(html.indexOf('id="bereich-spielwelt"'), html.indexOf('id="bereich-pingpong"'));
        expect(bereich).toContain('Spielwelt-Ankündigungskanal');
        expect(bereich).toContain('Drachen erlegt');
        expect(bereich).toContain('name="feld" value="spielwelt-kanal"');
    });

    it('renderConfigSeite escaped den Meldungstext und zeigt ihn nur im eigenen Bereich', () => {
        const html = renderConfigSeite({
            ...vollstaendigeDaten(),
            meldung: {bereich: 'event', text: '<b>böse</b>', art: 'warnung'},
        });
        expect(html).toContain('&lt;b&gt;böse&lt;/b&gt;');
        expect(html).not.toContain('<b>böse</b>');
        // Genau einmal - nicht in jedem Bereich.
        expect(html.match(/class="meldung/g)).toHaveLength(1);
    });

    it('escapeHtml neutralisiert HTML-Sonderzeichen', () => {
        expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;');
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

        // Wer hier nachsieht, sucht "was ist gerade passiert" - vorher standen die neuesten Zeilen
        // ganz unten, nach 500 Zeilen Scrollen.
        it('renderLogs zeigt die neuesten Zeilen zuerst', () => {
            const html = renderLogs([
                {zeit: Date.parse('2026-07-26T08:00:00'), level: 'log', text: 'ALT'},
                {zeit: Date.parse('2026-07-26T09:00:00'), level: 'log', text: 'NEU'},
            ]);
            expect(html.indexOf('NEU')).toBeLessThan(html.indexOf('ALT'));
            expect(html).toContain('neueste zuerst');
        });

        it('renderLogs filtert auf Warnungen und Fehler', () => {
            const eintraege = [
                {zeit: 1, level: 'log' as const, text: 'Normalbetrieb'},
                {zeit: 2, level: 'warn' as const, text: 'eine Warnung'},
                {zeit: 3, level: 'error' as const, text: 'ein Fehler'},
            ];
            const gefiltert = renderLogs(eintraege, true);
            expect(gefiltert).not.toContain('Normalbetrieb');
            expect(gefiltert).toContain('eine Warnung');
            expect(gefiltert).toContain('ein Fehler');
            // Ungefiltert ist alles da.
            expect(renderLogs(eintraege, false)).toContain('Normalbetrieb');
        });

        it('renderLogs zählt beide Filter-Stände und verlinkt nur den inaktiven', () => {
            const eintraege = [
                {zeit: 1, level: 'log' as const, text: 'a'},
                {zeit: 2, level: 'warn' as const, text: 'b'},
            ];
            expect(renderLogs(eintraege, false)).toContain('href="/config/logs?nur=probleme"');
            expect(renderLogs(eintraege, false)).toContain('<strong>Alle (2)</strong>');
            expect(renderLogs(eintraege, true)).toContain('<strong>Nur Warnungen und Fehler (1)</strong>');
            expect(renderLogs(eintraege, true)).toContain('href="/config/logs"');
        });

        it('renderLogs meldet einen leeren Filter-Treffer eigenständig', () => {
            const html = renderLogs([{zeit: 1, level: 'log', text: 'a'}], true);
            expect(html).toContain('Keine Warnungen oder Fehler');
        });

        it('handleLogs rendert die gepufferten Zeilen', () => {
            (logBuffer.getLogEntries as any).mockReturnValue([
                {zeit: Date.now(), level: 'log', text: 'eine Zeile'},
            ]);
            const res = mockResponse();

            handleLogs(mockRequest(), res);

            expect(res.send.mock.calls[0][0]).toContain('eine Zeile');
        });

        it('handleLogs übernimmt den Filter aus der Query', () => {
            (logBuffer.getLogEntries as any).mockReturnValue([
                {zeit: Date.now(), level: 'log', text: 'Normalbetrieb'},
                {zeit: Date.now(), level: 'warn', text: 'eine Warnung'},
            ]);
            const res = mockResponse();

            handleLogs(mockRequest({query: {nur: 'probleme'}}), res);

            const html = res.send.mock.calls[0][0] as string;
            expect(html).not.toContain('Normalbetrieb');
            expect(html).toContain('eine Warnung');
        });
    });

    it('handleConfigPage verlinkt die Log-Ansicht', async () => {
        const res = mockResponse();
        res.locals.configUserId = '12345';

        await handleConfigPage(mockRequest(), res);

        expect(res.send.mock.calls[0][0]).toContain('href="/config/logs"');
    });

    // Ein Admin-Panel gehört weder in den Browser-/Proxy-Cache (Back-Button nach dem Abmelden)
    // noch in einen Suchindex - die Login-Seite ist öffentlich erreichbar.
    it('setzeAdminHeader verbietet Caching und Indexierung', () => {
        const res = mockResponse();
        const next = vi.fn();

        setzeAdminHeader(mockRequest(), res, next);

        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(res.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow');
        expect(next).toHaveBeenCalledTimes(1);
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
