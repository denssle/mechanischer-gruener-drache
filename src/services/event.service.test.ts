import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./redis.service.js', () => ({
    default: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
    }
}));

import redisService from './redis.service.js';
import eventService from './event.service.js';

describe('EventService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('speichert ein Event mit Titel als JSON unter EVENT:NEXT', async () => {
        await eventService.setEvent(1700000000000, 'LAN-Party');

        expect(redisService.set).toHaveBeenCalledWith(
            'EVENT:NEXT',
            JSON.stringify({ timestamp: 1700000000000, title: 'LAN-Party' })
        );
    });

    it('speichert ein Event ohne Titel ohne title-Feld', async () => {
        await eventService.setEvent(1700000000000);

        expect(redisService.set).toHaveBeenCalledWith(
            'EVENT:NEXT',
            JSON.stringify({ timestamp: 1700000000000 })
        );
    });

    it('liest ein gespeichertes Event', async () => {
        vi.mocked(redisService.get).mockResolvedValue(JSON.stringify({ timestamp: 123, title: 'X' }));

        const event = await eventService.getEvent();

        expect(event).toEqual({ timestamp: 123, title: 'X' });
    });

    it('gibt null zurück wenn kein Event gesetzt ist', async () => {
        vi.mocked(redisService.get).mockResolvedValue(null);

        expect(await eventService.getEvent()).toBeNull();
    });

    it('löscht das Event', async () => {
        await eventService.clearEvent();

        expect(redisService.delete).toHaveBeenCalledWith('EVENT:NEXT');
    });
});
