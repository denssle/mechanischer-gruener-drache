import { createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';

// Wir lesen das Secret aus der config.json
const configPath = path.join(process.cwd(), 'config.json');
if (!fs.existsSync(configPath)) {
    console.error('config.json nicht gefunden! Bitte erstelle eine config.json im Root-Verzeichnis.');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const secret = config.TWITCH_WEBHOOK_SECRET;

if (!secret) {
    console.error('TWITCH_WEBHOOK_SECRET nicht in config.json definiert!');
    process.exit(1);
}

const url = 'http://localhost:3000/twitch/eventsub';

const sendMockWebhook = async (type: string, body: any) => {
    const bodyString = JSON.stringify(body);
    const messageId = `mock-msg-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    const message = messageId + timestamp + bodyString;
    const signature = 'sha256=' + createHmac('sha256', secret)
        .update(message)
        .digest('hex');

    console.log(`Sende ${type} an ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'twitch-eventsub-message-id': messageId,
                'twitch-eventsub-message-timestamp': timestamp,
                'twitch-eventsub-message-signature': signature,
                'twitch-eventsub-message-type': type
            },
            body: bodyString
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        if (text) console.log(`Response: ${text}`);

        if (!response.ok) {
            console.error(`Fehler: Webhook wurde mit Status ${response.status} abgelehnt.`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`Fehler beim Senden: ${error.message}`);
        process.exit(1);
    }
};

const main = async () => {
    const arg = process.argv[2];

    if (arg === 'verify') {
        await sendMockWebhook('webhook_callback_verification', { challenge: 'poggers-challenge-123' });
    } else if (arg === 'notify') {
        await sendMockWebhook('notification', {
            event: {
                broadcaster_user_id: '123456',
                broadcaster_user_login: 'teststreamer',
                broadcaster_user_name: 'TestStreamer',
                type: 'live',
                started_at: new Date().toISOString()
            }
        });
    } else {
        console.log('Verwendung: node scripts/test-twitch-webhook.js [verify|notify]');
    }
};

main();
