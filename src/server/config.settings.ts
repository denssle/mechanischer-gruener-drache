import {TextChannel} from 'discord.js';
import client from '../client.js';
import config from '../../config.json' with {type: 'json'};
import twitchUserService from '../services/twitch.user.service.js';
import sportService from '../services/sport.service.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import eventService from '../services/event.service.js';

// Sammelt die aktuell konfigurierten Admin-Einstellungen fuer die read-only-Anzeige auf /config.
// Dieselben Werte, die /diagnose prueft (siehe diagnose.handler.ts) - hier aber als strukturierte
// Daten fuers Web-Rendering. Kanal-/Rollen-IDs werden ueber den Bot zu Namen aufgeloest.
// client wird nur in Funktionskoerpern benutzt (Zirkular-Import-Falle, wie config.router.ts).

export type EinstellungStatus = 'ok' | 'warnung' | 'leer';

export interface Einstellung {
    label: string;
    // Menschenlesbarer, schon aufgeloester Wert (roh - wird erst beim Rendern HTML-escaped).
    wert: string;
    status: EinstellungStatus;
}

async function kanalEinstellung(label: string, channelId: string | null): Promise<Einstellung> {
    if (!channelId) {
        return {label, wert: 'nicht gesetzt', status: 'leer'};
    }
    const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    if (!channel) {
        return {label, wert: `gesetzt (${channelId}), aber nicht abrufbar`, status: 'warnung'};
    }
    return {label, wert: `#${channel.name}`, status: 'ok'};
}

async function rolleEinstellung(label: string, roleId: string | null): Promise<Einstellung> {
    if (!roleId) {
        return {label, wert: 'nicht gesetzt (optional)', status: 'leer'};
    }
    const role = client.guilds.cache.get(config.GUILD_ID)?.roles.cache.get(roleId);
    if (!role) {
        return {label, wert: `gesetzt (${roleId}), aber nicht abrufbar`, status: 'warnung'};
    }
    return {label, wert: `@${role.name}`, status: 'ok'};
}

function formatEvent(event: {timestamp: number; title?: string}): string {
    const datum = new Date(event.timestamp).toLocaleString('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    return event.title ? `${datum} – ${event.title}` : datum;
}

export async function sammleEinstellungen(): Promise<Einstellung[]> {
    const einstellungen: Einstellung[] = [];

    einstellungen.push(await kanalEinstellung('Twitch-Benachrichtigungskanal', await twitchUserService.getNotificationChannel()));
    einstellungen.push(await rolleEinstellung('Twitch-Benachrichtigungsrolle', await twitchUserService.getNotificationRole()));
    einstellungen.push(await kanalEinstellung('Sport-Ankündigungskanal', await sportService.getAnnouncementChannel()));
    einstellungen.push(await kanalEinstellung('Protokoll-Kanal', await loggingService.getLogChannel()));
    einstellungen.push(await kanalEinstellung('Morgengruß-Kanal', await greetingService.getChannel()));

    const event = await eventService.getEvent();
    einstellungen.push(event
        ? {label: 'Nächstes Event', wert: formatEvent(event), status: 'ok'}
        : {label: 'Nächstes Event', wert: 'kein Event gesetzt', status: 'leer'});

    return einstellungen;
}
