import {describe, it, expect, vi} from 'vitest';
import {createHmac} from 'crypto';

// Secret VOR dem Import setzen (config.session liest es beim Laden).
vi.mock('../../config.json', () => ({
    default: {CONFIG_SESSION_SECRET: 'test-secret'}
}));

import {
    buildSetCookie,
    parseCookies,
    sessionConfigured,
    signSession,
    verifySession
} from './config.session.js';

const SECRET = 'test-secret';

const makeToken = (userId: string, expiry: number, secret = SECRET): string => {
    const payload = `${userId}.${expiry}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
};

describe('config.session', () => {
    it('meldet sich als konfiguriert, wenn ein Secret gesetzt ist', () => {
        expect(sessionConfigured()).toBe(true);
    });

    it('signiert und verifiziert eine Session im Round-Trip', () => {
        const cookie = signSession('12345');
        expect(verifySession(cookie)).toBe('12345');
    });

    it('lehnt ein abgelaufenes Cookie ab', () => {
        const expired = makeToken('12345', Date.now() - 1000);
        expect(verifySession(expired)).toBeNull();
    });

    it('lehnt eine manipulierte Signatur ab', () => {
        const valid = signSession('12345');
        const tampered = valid.slice(0, -1) + (valid.endsWith('a') ? 'b' : 'a');
        expect(verifySession(tampered)).toBeNull();
    });

    it('lehnt eine mit falschem Secret signierte Session ab', () => {
        const foreign = makeToken('12345', Date.now() + 100000, 'anderes-secret');
        expect(verifySession(foreign)).toBeNull();
    });

    it('lehnt Cookies mit falscher Teilanzahl / falscher Signaturlänge ab', () => {
        expect(verifySession('nur.zwei')).toBeNull();
        expect(verifySession('12345.99999999999999.abc')).toBeNull();
        expect(verifySession(undefined)).toBeNull();
    });

    it('parst Cookie-Header und Kantenfälle', () => {
        expect(parseCookies('a=1; b=2')).toEqual({a: '1', b: '2'});
        expect(parseCookies('  x=y  ')).toEqual({x: 'y'});
        expect(parseCookies('kaputt; c=3')).toEqual({c: '3'});
        expect(parseCookies(undefined)).toEqual({});
    });

    it('baut Set-Cookie-Strings mit den erwarteten Attributen', () => {
        const secure = buildSetCookie('sess', 'wert', 3600, true);
        expect(secure).toContain('sess=wert');
        expect(secure).toContain('HttpOnly');
        expect(secure).toContain('SameSite=Lax');
        expect(secure).toContain('Path=/config');
        expect(secure).toContain('Max-Age=3600');
        expect(secure).toContain('Secure');

        const insecure = buildSetCookie('sess', '', 0, false);
        expect(insecure).toContain('Max-Age=0');
        expect(insecure).not.toContain('Secure');
    });
});
