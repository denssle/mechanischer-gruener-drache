import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    setChannel: vi.fn(),
    getChannel: vi.fn(),
    getLastGreetingDay: vi.fn(),
    setLastGreetingDay: vi.fn(),
    setLearnedEmoji: vi.fn(),
    getLearnedEmojis: vi.fn(),
    setManualEmoji: vi.fn(),
    getManualEmojis: vi.fn(),
}));
vi.mock('../services/greeting.service.js', () => ({ default: svc }));

const channelsFetch = vi.hoisted(() => vi.fn());
vi.mock('../client.js', () => ({ default: { channels: { fetch: channelsFetch } } }));

import greetingHandler, {
    WELLE,
    GRUSS_EMOJIS,
    ableiteEmoji,
    werteReaktionenAus,
} from './greeting.handler.js';

function heuteAlsTag(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeMessage(overrides: Record<string, unknown> = {}) {
    return {
        author: { bot: false, id: 'u1' },
        channelId: 'greet-channel',
        react: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as any;
}

describe('ableiteEmoji (Fallback)', () => {
    it('liefert immer ein Emoji aus dem Pool', () => {
        for (const id of ['1', '42', '123456789012345678', '999']) {
            expect(GRUSS_EMOJIS).toContain(ableiteEmoji(id));
        }
    });

    it('ist stabil für dieselbe User-ID', () => {
        expect(ableiteEmoji('123456789012345678')).toBe(ableiteEmoji('123456789012345678'));
    });
});

describe('werteReaktionenAus', () => {
    it('leitet das persönliche Emoji aus dem Ko-Emoji neben der Welle ab', () => {
        const map = werteReaktionenAus([
            { authorId: 'tirsis', emojis: [WELLE, '☀️'] },
        ]);
        expect(map).toEqual({ tirsis: '☀️' });
    });

    it('ignoriert Nachrichten ohne Welle-Reaktion', () => {
        const map = werteReaktionenAus([
            { authorId: 'tirsis', emojis: ['☀️', '🔥'] },
        ]);
        expect(map).toEqual({});
    });

    it('nimmt bei mehreren Beobachtungen das häufigste Ko-Emoji', () => {
        const map = werteReaktionenAus([
            { authorId: 'tirsis', emojis: [WELLE, '☀️'] },
            { authorId: 'tirsis', emojis: [WELLE, '☀️'] },
            { authorId: 'tirsis', emojis: [WELLE, '🔥'] },
        ]);
        expect(map.tirsis).toBe('☀️');
    });

    it('zählt Welle selbst nicht als persönliches Emoji', () => {
        const map = werteReaktionenAus([
            { authorId: 'nur-welle', emojis: [WELLE] },
        ]);
        expect(map['nur-welle']).toBeUndefined();
    });
});

describe('GreetingHandler.lerneAusHistorie', () => {
    beforeEach(() => {
        Object.values(svc).forEach(fn => fn.mockReset());
        channelsFetch.mockReset();
    });

    it('gibt null zurück, wenn kein Kanal gesetzt ist', async () => {
        svc.getChannel.mockResolvedValue(null);

        expect(await greetingHandler.lerneAusHistorie()).toBeNull();
        expect(svc.setLearnedEmoji).not.toHaveBeenCalled();
    });

    it('scannt die Historie, speichert die abgeleiteten Emojis und gibt die Anzahl zurück', async () => {
        svc.getChannel.mockResolvedValue('greet-channel');
        // Eine Begrüßung von "tirsis": Welle + persönliches ☀️ - genau das Signal, das gelernt wird.
        const nachricht = {
            id: 'm1',
            author: { id: 'tirsis' },
            reactions: { cache: { values: () => [
                { emoji: { id: null, name: WELLE } },
                { emoji: { id: null, name: '☀️' } },
            ] } },
        };
        const batch = { size: 1, values: () => [nachricht].values(), last: () => nachricht };
        const channel = {
            isTextBased: () => true,
            messages: { fetch: vi.fn().mockResolvedValue(batch) },
        };
        channelsFetch.mockResolvedValue(channel);

        const anzahl = await greetingHandler.lerneAusHistorie();

        expect(anzahl).toBe(1);
        expect(svc.setLearnedEmoji).toHaveBeenCalledWith('tirsis', '☀️');
    });
});

describe('GreetingHandler.handleMessage', () => {
    beforeEach(() => {
        Object.values(svc).forEach(fn => fn.mockReset());
        svc.getChannel.mockResolvedValue('greet-channel');
        svc.getLastGreetingDay.mockResolvedValue(null);
        svc.getLearnedEmojis.mockResolvedValue({});
        svc.getManualEmojis.mockResolvedValue({});
    });

    it('begrüßt die erste Nachricht des Tages mit Welle + Fallback-Emoji', async () => {
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(svc.setLastGreetingDay).toHaveBeenCalledWith('u1', heuteAlsTag());
        expect(message.react).toHaveBeenCalledWith(WELLE);
        expect(message.react).toHaveBeenCalledWith(ableiteEmoji('u1'));
    });

    it('bevorzugt das gelernte Emoji vor dem Fallback', async () => {
        // Bewusst ein pool-fremdes Emoji, damit es sich nicht mit ableiteEmoji('u1') deckt.
        svc.getLearnedEmojis.mockResolvedValue({ u1: '🔥' });
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(message.react).toHaveBeenCalledWith('🔥');
        expect(message.react).not.toHaveBeenCalledWith(ableiteEmoji('u1'));
    });

    // Dritter Zustand: von Hand auf /config gesetzt. Er schlägt das Gelernte - sonst hätte ein
    // späterer Historien-Scan die bewusste Entscheidung wieder überschrieben.
    it('bevorzugt das manuell gesetzte Emoji vor dem gelernten', async () => {
        svc.getManualEmojis.mockResolvedValue({ u1: '🍪' });
        svc.getLearnedEmojis.mockResolvedValue({ u1: '🔥' });
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(message.react).toHaveBeenCalledWith('🍪');
        expect(message.react).not.toHaveBeenCalledWith('🔥');
    });

    // Fehlertoleranz je Hash: fällt der manuelle Read aus, soll wenigstens das Gelernte greifen.
    it('nutzt das gelernte Emoji, wenn der manuelle Hash nicht lesbar ist', async () => {
        svc.getManualEmojis.mockRejectedValue(new Error('Redis weg'));
        svc.getLearnedEmojis.mockResolvedValue({ u1: '🔥' });
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(message.react).toHaveBeenCalledWith('🔥');
    });

    it('ignoriert Bot-Nachrichten', async () => {
        const message = makeMessage({ author: { bot: true, id: 'b1' } });

        await greetingHandler.handleMessage(message);

        expect(message.react).not.toHaveBeenCalled();
        expect(svc.setLastGreetingDay).not.toHaveBeenCalled();
    });

    it('tut nichts, wenn kein Kanal konfiguriert ist', async () => {
        svc.getChannel.mockResolvedValue(null);

        await greetingHandler.handleMessage(makeMessage());

        expect(svc.setLastGreetingDay).not.toHaveBeenCalled();
    });

    it('reagiert nicht in einem anderen Kanal', async () => {
        const message = makeMessage({ channelId: 'anderer-kanal' });

        await greetingHandler.handleMessage(message);

        expect(message.react).not.toHaveBeenCalled();
    });

    it('begrüßt dieselbe Person nur einmal pro Tag (Tagesmarker bereits gesetzt)', async () => {
        svc.getLastGreetingDay.mockResolvedValue(heuteAlsTag());
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(message.react).not.toHaveBeenCalled();
        expect(svc.setLastGreetingDay).not.toHaveBeenCalled();
    });

    it('begrüßt jede Person einzeln (Marker pro User, nicht global)', async () => {
        // u1 wurde heute schon begrüßt, u2 noch nicht.
        svc.getLastGreetingDay.mockImplementation(async (userId: string) =>
            userId === 'u1' ? heuteAlsTag() : null
        );

        const m1 = makeMessage({ author: { bot: false, id: 'u1' } });
        await greetingHandler.handleMessage(m1);
        expect(m1.react).not.toHaveBeenCalled();

        const m2 = makeMessage({ author: { bot: false, id: 'u2' } });
        await greetingHandler.handleMessage(m2);
        expect(m2.react).toHaveBeenCalledWith(WELLE);
        expect(m2.react).toHaveBeenCalledWith(ableiteEmoji('u2'));
        expect(svc.setLastGreetingDay).toHaveBeenCalledWith('u2', heuteAlsTag());
    });

    it('setzt das persönliche Emoji auch dann, wenn die Welle-Reaktion scheitert', async () => {
        const message = makeMessage({
            react: vi.fn()
                .mockRejectedValueOnce(new Error('keine Rechte'))
                .mockResolvedValueOnce(undefined),
        });

        await greetingHandler.handleMessage(message);

        expect(message.react).toHaveBeenNthCalledWith(1, WELLE);
        expect(message.react).toHaveBeenNthCalledWith(2, ableiteEmoji('u1'));
    });
});
