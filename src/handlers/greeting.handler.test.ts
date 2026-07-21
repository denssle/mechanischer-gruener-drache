import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    setChannel: vi.fn(),
    getChannel: vi.fn(),
    getLastGreetingDay: vi.fn(),
    setLastGreetingDay: vi.fn(),
    setLearnedEmoji: vi.fn(),
    getLearnedEmojis: vi.fn(),
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

describe('GreetingHandler.handleSetChannel', () => {
    beforeEach(() => {
        Object.values(svc).forEach(fn => fn.mockReset());
        channelsFetch.mockReset();
    });

    it('lehnt Nicht-Admins ephemer ab', async () => {
        const interaction = { memberPermissions: { has: () => false }, reply: vi.fn() } as any;

        await greetingHandler.handleSetChannel(interaction);

        expect(svc.setChannel).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('Administrator');
    });

    it('speichert den Kanal und bestätigt (auch wenn der Scan nichts findet)', async () => {
        svc.getChannel.mockResolvedValue('chan-99');
        channelsFetch.mockResolvedValue(null); // Kanal nicht abrufbar -> Scan übersprungen
        const interaction = {
            memberPermissions: { has: () => true },
            options: { getChannel: () => ({ id: 'chan-99' }) },
            deferReply: vi.fn(),
            editReply: vi.fn(),
        } as any;

        await greetingHandler.handleSetChannel(interaction);

        expect(svc.setChannel).toHaveBeenCalledWith('chan-99');
        expect(interaction.editReply.mock.calls[0][0]).toContain('<#chan-99>');
    });

    it('scannt die Historie und lernt Emojis, wenn der Kanal abrufbar ist', async () => {
        svc.getChannel.mockResolvedValue('chan-99');
        const messages = new Map([
            ['m1', { author: { id: 'tirsis' }, reactions: { cache: new Map([
                ['w', { emoji: { id: null, name: WELLE } }],
                ['s', { emoji: { id: null, name: '☀️' } }],
            ]) } }],
        ]) as any;
        messages.last = () => ({ id: 'm1' });
        const channel = { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue(messages) } };
        channelsFetch.mockResolvedValue(channel);
        const interaction = {
            memberPermissions: { has: () => true },
            options: { getChannel: () => ({ id: 'chan-99' }) },
            deferReply: vi.fn(),
            editReply: vi.fn(),
        } as any;

        await greetingHandler.handleSetChannel(interaction);

        expect(svc.setLearnedEmoji).toHaveBeenCalledWith('tirsis', '☀️');
        expect(interaction.editReply.mock.calls[0][0]).toContain('1 persönliche Emojis');
    });
});

describe('GreetingHandler.handleLernen', () => {
    beforeEach(() => {
        Object.values(svc).forEach(fn => fn.mockReset());
        channelsFetch.mockReset();
    });

    it('meldet, wenn kein Kanal gesetzt ist', async () => {
        svc.getChannel.mockResolvedValue(null);
        const interaction = {
            memberPermissions: { has: () => true },
            deferReply: vi.fn(),
            editReply: vi.fn(),
        } as any;

        await greetingHandler.handleLernen(interaction);

        expect(interaction.editReply.mock.calls[0][0]).toContain('kein');
    });
});

describe('GreetingHandler.handleMessage', () => {
    beforeEach(() => {
        Object.values(svc).forEach(fn => fn.mockReset());
        svc.getChannel.mockResolvedValue('greet-channel');
        svc.getLastGreetingDay.mockResolvedValue(null);
        svc.getLearnedEmojis.mockResolvedValue({});
    });

    it('begrüßt die erste Nachricht des Tages mit Welle + Fallback-Emoji', async () => {
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(svc.setLastGreetingDay).toHaveBeenCalledWith(heuteAlsTag());
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

    it('begrüßt nur einmal pro Tag (Tagesmarker bereits gesetzt)', async () => {
        svc.getLastGreetingDay.mockResolvedValue(heuteAlsTag());
        const message = makeMessage();

        await greetingHandler.handleMessage(message);

        expect(message.react).not.toHaveBeenCalled();
        expect(svc.setLastGreetingDay).not.toHaveBeenCalled();
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
