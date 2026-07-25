import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../config.json', () => ({default: {GUILD_ID: 'guild-1'}}));
vi.mock('../client.js', () => ({
    default: {channels: {fetch: vi.fn()}, guilds: {cache: new Map()}}
}));
vi.mock('../services/twitch.user.service.js', () => ({
    default: {getNotificationChannel: vi.fn(), getNotificationRole: vi.fn()}
}));
vi.mock('../services/sport.service.js', () => ({default: {getAnnouncementChannel: vi.fn()}}));
vi.mock('../services/logging.service.js', () => ({default: {getLogChannel: vi.fn()}}));
vi.mock('../services/greeting.service.js', () => ({default: {getChannel: vi.fn()}}));
vi.mock('../services/event.service.js', () => ({default: {getEvent: vi.fn()}}));

import client from '../client.js';
import twitchUserService from '../services/twitch.user.service.js';
import sportService from '../services/sport.service.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import eventService from '../services/event.service.js';
import {ChannelType, Collection} from 'discord.js';
import {Einstellung, holeTextKanaele, istGueltigerTextKanal, sammleEinstellungen} from './config.settings.js';

const finde = (einstellungen: Einstellung[], label: string): Einstellung =>
    einstellungen.find(e => e.label === label)!;

describe('config.settings – sammleEinstellungen', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Standard: alles leer.
        (twitchUserService.getNotificationChannel as any).mockResolvedValue(null);
        (twitchUserService.getNotificationRole as any).mockResolvedValue(null);
        (sportService.getAnnouncementChannel as any).mockResolvedValue(null);
        (loggingService.getLogChannel as any).mockResolvedValue(null);
        (greetingService.getChannel as any).mockResolvedValue(null);
        (eventService.getEvent as any).mockResolvedValue(null);
        (client.channels.fetch as any).mockResolvedValue(null);
        (client.guilds as any).cache = new Map();
    });

    it('meldet alle Einstellungen als leer, wenn nichts gesetzt ist', async () => {
        const einstellungen = await sammleEinstellungen();
        expect(einstellungen).toHaveLength(6);
        expect(einstellungen.every(e => e.status === 'leer')).toBe(true);
        expect(finde(einstellungen, 'Nächstes Event').wert).toBe('kein Event gesetzt');
    });

    it('löst einen gesetzten, abrufbaren Kanal zum Namen auf', async () => {
        (loggingService.getLogChannel as any).mockResolvedValue('chan-1');
        (client.channels.fetch as any).mockResolvedValue({name: 'protokoll'});

        const protokoll = finde(await sammleEinstellungen(), 'Protokoll-Kanal');
        expect(protokoll.status).toBe('ok');
        expect(protokoll.wert).toBe('#protokoll');
    });

    it('markiert einen gesetzten, aber nicht abrufbaren Kanal als Warnung', async () => {
        (loggingService.getLogChannel as any).mockResolvedValue('chan-weg');
        (client.channels.fetch as any).mockRejectedValue(new Error('unbekannt'));

        const protokoll = finde(await sammleEinstellungen(), 'Protokoll-Kanal');
        expect(protokoll.status).toBe('warnung');
        expect(protokoll.wert).toContain('chan-weg');
    });

    it('löst eine gesetzte Twitch-Rolle zum Namen auf', async () => {
        (twitchUserService.getNotificationRole as any).mockResolvedValue('role-1');
        (client.guilds as any).cache = new Map([
            ['guild-1', {roles: {cache: new Map([['role-1', {name: 'Streamer'}]])}}]
        ]);

        const rolle = finde(await sammleEinstellungen(), 'Twitch-Benachrichtigungsrolle');
        expect(rolle.status).toBe('ok');
        expect(rolle.wert).toBe('@Streamer');
    });

    describe('holeTextKanaele / istGueltigerTextKanal', () => {
        const mitKanaelen = () => {
            (client.guilds as any).cache = new Map([['guild-1', {
                channels: {
                    cache: new Collection<string, any>([
                        ['c2', {id: 'c2', name: 'zebra', type: ChannelType.GuildText}],
                        ['c1', {id: 'c1', name: 'allgemein', type: ChannelType.GuildText}],
                        ['c3', {id: 'c3', name: 'ankuendigungen', type: ChannelType.GuildAnnouncement}],
                        ['v1', {id: 'v1', name: 'Sprachkanal', type: ChannelType.GuildVoice}],
                    ])
                }
            }]]);
        };

        it('liefert Text- und Announcement-Kanäle alphabetisch, ohne Sprachkanäle', () => {
            mitKanaelen();
            const kanaele = holeTextKanaele();
            expect(kanaele.map(k => k.name)).toEqual(['allgemein', 'ankuendigungen', 'zebra']);
        });

        it('sortiert nach dem Namen ohne führendes Emoji/Symbol', () => {
            (client.guilds as any).cache = new Map([['guild-1', {
                channels: {
                    cache: new Collection<string, any>([
                        ['c1', {id: 'c1', name: '🎮-spiele', type: ChannelType.GuildText}],
                        ['c2', {id: 'c2', name: '📢-ankuendigungen', type: ChannelType.GuildText}],
                        ['c3', {id: 'c3', name: 'allgemein', type: ChannelType.GuildText}],
                    ])
                }
            }]]);
            // Sortiert nach spiele/ankuendigungen/allgemein -> Anzeigename bleibt aber inkl. Emoji.
            expect(holeTextKanaele().map(k => k.name)).toEqual(['allgemein', '📢-ankuendigungen', '🎮-spiele']);
        });

        it('akzeptiert nur IDs aus der Kanalliste', () => {
            mitKanaelen();
            expect(istGueltigerTextKanal('c1')).toBe(true);
            expect(istGueltigerTextKanal('v1')).toBe(false);
            expect(istGueltigerTextKanal('fremd')).toBe(false);
        });

        it('liefert eine leere Liste, wenn die Guild nicht im Cache ist', () => {
            (client.guilds as any).cache = new Map();
            expect(holeTextKanaele()).toEqual([]);
        });
    });

    it('zeigt ein gesetztes Event mit Titel', async () => {
        (eventService.getEvent as any).mockResolvedValue({timestamp: Date.UTC(2026, 11, 24, 18, 0), title: 'Weihnachtstreffen'});

        const event = finde(await sammleEinstellungen(), 'Nächstes Event');
        expect(event.status).toBe('ok');
        expect(event.wert).toContain('Weihnachtstreffen');
    });
});
