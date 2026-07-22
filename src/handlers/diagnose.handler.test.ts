import { describe, it, expect, vi, beforeEach } from 'vitest';

const twitchUser = vi.hoisted(() => ({
    getNotificationChannel: vi.fn(),
    getNotificationRole: vi.fn(),
    getAllLinks: vi.fn(),
}));
const twitch = vi.hoisted(() => ({ listStreamOnlineSubscriptions: vi.fn() }));
const sport = vi.hoisted(() => ({ getAnnouncementChannel: vi.fn() }));
const logging = vi.hoisted(() => ({ getLogChannel: vi.fn() }));
const greeting = vi.hoisted(() => ({ getChannel: vi.fn() }));
const event = vi.hoisted(() => ({ getEvent: vi.fn() }));
const channelsFetch = vi.hoisted(() => vi.fn());

vi.mock('../client.js', () => ({ default: { channels: { fetch: channelsFetch } } }));
vi.mock('../services/twitch.user.service.js', () => ({ default: twitchUser }));
vi.mock('../services/twitch.service.js', () => ({ default: twitch }));
vi.mock('../services/sport.service.js', () => ({ default: sport }));
vi.mock('../services/logging.service.js', () => ({ default: logging }));
vi.mock('../services/greeting.service.js', () => ({ default: greeting }));
vi.mock('../services/event.service.js', () => ({ default: event }));

import diagnoseHandler from './diagnose.handler.js';

function makeInteraction(isAdmin = true) {
    return {
        memberPermissions: { has: () => isAdmin },
        reply: vi.fn(),
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn(),
    } as any;
}

const report = (interaction: any) => interaction.editReply.mock.calls[0][0] as string;

describe('DiagnoseHandler', () => {
    beforeEach(() => {
        [twitchUser, twitch, sport, logging, greeting, event].forEach(svc =>
            Object.values(svc).forEach(fn => (fn as any).mockReset())
        );
        channelsFetch.mockReset();
        // Standard: nichts gesetzt
        twitchUser.getNotificationChannel.mockResolvedValue(null);
        twitchUser.getNotificationRole.mockResolvedValue(null);
        twitchUser.getAllLinks.mockResolvedValue([]);
        twitch.listStreamOnlineSubscriptions.mockResolvedValue([]);
        sport.getAnnouncementChannel.mockResolvedValue(null);
        logging.getLogChannel.mockResolvedValue(null);
        greeting.getChannel.mockResolvedValue(null);
        event.getEvent.mockResolvedValue(null);
        channelsFetch.mockResolvedValue({ id: 'ok' });
    });

    it('lehnt Nicht-Admins ephemer ab', async () => {
        const interaction = makeInteraction(false);

        await diagnoseHandler.handleDiagnose(interaction);

        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('Administrator');
    });

    it('meldet ungesetzte Kanäle mit ❌ und keine Subscriptions', async () => {
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        const text = report(interaction);
        expect(text).toContain('Benachrichtigungskanal: ❌ nicht gesetzt');
        expect(text).toContain('Sport-Ankündigungskanal: ❌ nicht gesetzt');
        expect(text).toContain('Protokoll-Kanal: ❌ nicht gesetzt');
        expect(text).toContain('Morgengruß-Kanal: ❌ nicht gesetzt');
        expect(text).toContain('kein Event gesetzt');
        expect(text).toContain('keine');
    });

    it('markiert gesetzte, abrufbare Kanäle mit ✅ und einen Sub als enabled', async () => {
        twitchUser.getNotificationChannel.mockResolvedValue('tw-1');
        twitchUser.getNotificationRole.mockResolvedValue('role-1');
        sport.getAnnouncementChannel.mockResolvedValue('sport-1');
        logging.getLogChannel.mockResolvedValue('log-1');
        greeting.getChannel.mockResolvedValue('greet-1');
        event.getEvent.mockResolvedValue({ timestamp: 1_800_000_000_000 });
        twitchUser.getAllLinks.mockResolvedValue([{ twitchUserId: 'twitch-1', twitchDisplayName: 'Streamer', discordUserId: 'd-1' }]);
        twitch.listStreamOnlineSubscriptions.mockResolvedValue([
            { id: 's1', status: 'enabled', condition: { broadcaster_user_id: 'twitch-1' } },
        ]);
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        const text = report(interaction);
        expect(text).toContain('Benachrichtigungskanal: ✅ <#tw-1>');
        expect(text).toContain('Benachrichtigungsrolle: ✅ <@&role-1>');
        expect(text).toContain('Sport-Ankündigungskanal: ✅ <#sport-1>');
        expect(text).toContain('Morgengruß-Kanal: ✅ <#greet-1>');
        expect(text).toContain('Event: ✅');
        expect(text).toContain('**Streamer** (<@d-1>)');
        expect(text).not.toContain('Nicht alle Subscriptions');
    });

    it('warnt bei gesetztem, aber nicht abrufbarem Kanal', async () => {
        greeting.getChannel.mockResolvedValue('greet-weg');
        channelsFetch.mockImplementation(async (id: string) => (id === 'greet-weg' ? null : { id }));
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        expect(report(interaction)).toContain('Morgengruß-Kanal: ⚠️ gesetzt (`greet-weg`), aber nicht abrufbar');
    });

    it('warnt, wenn nicht alle Subscriptions enabled sind', async () => {
        twitchUser.getAllLinks.mockResolvedValue([{ twitchUserId: 'twitch-1', twitchDisplayName: 'Streamer', discordUserId: 'd-1' }]);
        twitch.listStreamOnlineSubscriptions.mockResolvedValue([
            { id: 's1', status: 'webhook_callback_verification_pending', condition: { broadcaster_user_id: 'twitch-1' } },
        ]);
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        const text = report(interaction);
        expect(text).toContain('Nicht alle Subscriptions sind');
        expect(text).toContain('webhook_callback_verification_pending');
    });

    it('übersteht einen Twitch-Ausfall, statt die ganze Diagnose zu verlieren', async () => {
        twitch.listStreamOnlineSubscriptions.mockRejectedValue(new Error('Twitch weg'));
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        const text = report(interaction);
        expect(text).toContain('EventSub-Subscriptions konnten nicht abgefragt werden');
        // Die restliche Diagnose (weitere Kanäle) läuft trotzdem durch.
        expect(text).toContain('Morgengruß-Kanal:');
    });
});
