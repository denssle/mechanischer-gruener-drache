import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';
import twitchWebhookServer from './twitch.webhook.server.js';
import config from '../../config.json' with { type: 'json' };

describe('TwitchWebhookServer', () => {
    const secret = config.TWITCH_WEBHOOK_SECRET;
    
    const getSignature = (messageId: string, timestamp: string, body: string) => {
        const message = messageId + timestamp + body;
        return 'sha256=' + createHmac('sha256', secret)
            .update(message)
            .digest('hex');
    };

    const mockRequest = (headers: Record<string, string>, body: any) => {
        return {
            headers,
            body: Buffer.from(JSON.stringify(body))
        } as any;
    };

    const mockResponse = () => {
        const res: any = {};
        res.status = vi.fn().mockReturnValue(res);
        res.send = vi.fn().mockReturnValue(res);
        res.sendStatus = vi.fn().mockReturnValue(res);
        return res;
    };

    it('sollte eine gültige Verifizierungsanfrage akzeptieren', async () => {
        const body = { challenge: 'test-challenge' };
        const bodyString = JSON.stringify(body);
        const messageId = 'msg-1';
        const timestamp = new Date().toISOString();
        const signature = getSignature(messageId, timestamp, bodyString);

        const req = mockRequest({
            'twitch-eventsub-message-id': messageId,
            'twitch-eventsub-message-timestamp': timestamp,
            'twitch-eventsub-message-signature': signature,
            'twitch-eventsub-message-type': 'webhook_callback_verification'
        }, body);

        const res = mockResponse();

        twitchWebhookServer.handleEventSub(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('test-challenge');
    });

    it('sollte eine gültige Benachrichtigung verarbeiten', async () => {
        const callback = vi.fn();
        twitchWebhookServer.onNotification(callback);

        const event = {
            broadcaster_user_id: '12345',
            broadcaster_user_name: 'testuser'
        };
        const body = { event };
        const bodyString = JSON.stringify(body);
        const messageId = 'msg-2';
        const timestamp = new Date().toISOString();
        const signature = getSignature(messageId, timestamp, bodyString);

        const req = mockRequest({
            'twitch-eventsub-message-id': messageId,
            'twitch-eventsub-message-timestamp': timestamp,
            'twitch-eventsub-message-signature': signature,
            'twitch-eventsub-message-type': 'notification'
        }, body);

        const res = mockResponse();

        twitchWebhookServer.handleEventSub(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(204);
        expect(callback).toHaveBeenCalledWith('12345', event);
    });

    it('sollte ungültige Signaturen ablehnen', async () => {
        const body = { test: 'data' };
        
        const req = mockRequest({
            'twitch-eventsub-message-id': 'id',
            'twitch-eventsub-message-timestamp': 'ts',
            'twitch-eventsub-message-signature': 'sha256=invalid',
            'twitch-eventsub-message-type': 'notification'
        }, body);

        const res = mockResponse();

        twitchWebhookServer.handleEventSub(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);
    });
});
