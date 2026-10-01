import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./sport.service.js', () => ({
    default: {
        getAnnouncementChannel: vi.fn(),
    },
}));

vi.mock('../client.js', () => ({
    default: {
        channels: {
            fetch: vi.fn(),
        },
    },
}));

import sportService from './sport.service.js';
import client from '../client.js';
import ankuendigungskanalService from './ankuendigungskanal.service.js';

describe('AnkuendigungskanalService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('liefert null, wenn kein Ankündigungskanal konfiguriert ist', async () => {
        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue(null);

        const result =
            await ankuendigungskanalService.holeAnkuendigungskanal();

        expect(result).toBeNull();
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('liefert den konfigurierten Ankündigungskanal', async () => {
        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue('chan-1');

        const channel = {
            send: vi.fn(),
        };

        vi.mocked(client.channels.fetch)
            .mockResolvedValue(channel as any);

        const result =
            await ankuendigungskanalService.holeAnkuendigungskanal();

        expect(client.channels.fetch)
            .toHaveBeenCalledWith('chan-1');

        expect(result).toBe(channel);
    });

    it('liefert null, wenn der Ankündigungskanal nicht abrufbar ist', async () => {
        vi.mocked(sportService.getAnnouncementChannel)
            .mockResolvedValue('chan-1');

        vi.mocked(client.channels.fetch)
            .mockRejectedValue(new Error('Kanal nicht erreichbar'));

        const result =
            await ankuendigungskanalService.holeAnkuendigungskanal();

        expect(result).toBeNull();
    });
});