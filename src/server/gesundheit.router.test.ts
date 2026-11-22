import {describe, it, expect, vi, beforeEach} from 'vitest';

const pruefeGesundheit = vi.hoisted(() => vi.fn());
vi.mock('../services/gesundheit.service.js', () => ({pruefeGesundheit}));

import gesundheitRouter, {gesundheitHandler} from './gesundheit.router.js';

// Kein supertest im Projekt: Handler direkt mit Mock-req/res aufrufen (wie config.router.test.ts).
const mockResponse = () => {
    const res: any = {headersSent: false};
    res.setHeader = vi.fn(() => res);
    res.status = vi.fn(() => res);
    res.type = vi.fn(() => res);
    res.send = vi.fn(() => res);
    return res;
};

// Die Antwort kommt asynchron, nach der aufgelösten Prüfung.
const warte = () => new Promise(resolve => setTimeout(resolve, 0));

describe('gesundheitHandler', () => {
    beforeEach(() => {
        pruefeGesundheit.mockReset();
    });

    it('antwortet gesund mit 200 und "ok"', async () => {
        pruefeGesundheit.mockResolvedValue([]);
        const res = mockResponse();

        gesundheitHandler({} as any, res);
        await warte();

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('ok');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('antwortet krank mit 503 und nennt die Befunde', async () => {
        pruefeGesundheit.mockResolvedValue(['Redis nicht verbunden', 'Discord-Verbindung nicht bereit']);
        const res = mockResponse();

        gesundheitHandler({} as any, res);
        await warte();

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.send).toHaveBeenCalledWith('Redis nicht verbunden\nDiscord-Verbindung nicht bereit');
    });

    it('antwortet 503, wenn die Prüfung selbst wirft', async () => {
        pruefeGesundheit.mockRejectedValue(new Error('kaputt'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = mockResponse();

        gesundheitHandler({} as any, res);
        await warte();

        expect(res.status).toHaveBeenCalledWith(503);
    });
});

describe('gesundheitRouter', () => {
    it('hängt den Handler an GET /config/gesundheit', () => {
        const route = (gesundheitRouter as any).stack.find((schicht: any) => schicht.route?.path === '/config/gesundheit');

        expect(route?.route.methods).toEqual({get: true});
    });
});
