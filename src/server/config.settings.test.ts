import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../config.json', () => ({default: {GUILD_ID: 'guild-1'}}));
vi.mock('../client.js', () => ({
    default: {channels: {fetch: vi.fn()}, guilds: {cache: new Map()}}
}));
vi.mock('../services/twitch.user.service.js', () => ({
    default: {
        getNotificationChannel: vi.fn(), getNotificationRole: vi.fn(),
        setNotificationChannel: vi.fn(), setNotificationRole: vi.fn(), removeNotificationRole: vi.fn()
    }
}));
vi.mock('../services/sport.service.js', () => ({
    default: {
        getAnnouncementChannel: vi.fn(), setAnnouncementChannel: vi.fn(),
        setKilometer: vi.fn(), getLegacyKilometer: vi.fn(),
        addLegacyKilometer: vi.fn(), setLegacyKilometer: vi.fn(),
        getMilestones: vi.fn(), removeMilestone: vi.fn()
    }
}));
vi.mock('../services/logging.service.js', () => ({
    default: {getLogChannel: vi.fn(), setLogChannel: vi.fn()}
}));
vi.mock('../services/greeting.service.js', () => ({
    default: {getChannel: vi.fn(), setChannel: vi.fn()}
}));
vi.mock('../services/event.service.js', () => ({
    default: {getEvent: vi.fn(), setEvent: vi.fn(), clearEvent: vi.fn()}
}));

import client from '../client.js';
import twitchUserService from '../services/twitch.user.service.js';
import sportService from '../services/sport.service.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import eventService from '../services/event.service.js';
import {ChannelType, Collection} from 'discord.js';
import {
    addiereLegacyKilometer,
    Einstellung,
    entferneEvent,
    entferneMeilenstein,
    holeEventFelder,
    holeLegacyKilometer,
    holeMeilensteine,
    holeMitglieder,
    holeRollen,
    holeTextKanaele,
    istGueltigerTextKanal,
    istGueltigeRolle,
    istGueltigesMitglied,
    istKanalFeld,
    ladeKanalFelder,
    sammleEinstellungen,
    setzeLegacyKilometer,
    speichereEventDaten,
    speichereKanal,
    speichereKilometer,
    speichereTwitchRolle
} from './config.settings.js';

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

describe('config.settings – Kanal-Felder (bearbeiten)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('istKanalFeld kennt genau die Kanal-Einstellungen (und keine Prototyp-Keys)', () => {
        expect(istKanalFeld('protokoll')).toBe(true);
        expect(istKanalFeld('twitch-kanal')).toBe(true);
        expect(istKanalFeld('sport-kanal')).toBe(true);
        expect(istKanalFeld('morgengruss-kanal')).toBe(true);
        expect(istKanalFeld('event')).toBe(false);
        expect(istKanalFeld('__proto__')).toBe(false);
    });

    it('ladeKanalFelder liefert jedes Feld mit aktueller ID', async () => {
        (loggingService.getLogChannel as any).mockResolvedValue('log-1');
        (twitchUserService.getNotificationChannel as any).mockResolvedValue(null);
        (sportService.getAnnouncementChannel as any).mockResolvedValue('sport-1');
        (greetingService.getChannel as any).mockResolvedValue(null);

        const felder = await ladeKanalFelder();
        expect(felder.map(f => f.schluessel)).toEqual(['protokoll', 'twitch-kanal', 'sport-kanal', 'morgengruss-kanal']);
        expect(felder.find(f => f.schluessel === 'protokoll')!.aktuelleId).toBe('log-1');
        expect(felder.find(f => f.schluessel === 'sport-kanal')!.aktuelleId).toBe('sport-1');
        expect(felder.find(f => f.schluessel === 'twitch-kanal')!.aktuelleId).toBeNull();
    });

    it('speichereKanal ruft den passenden Service-Setter', async () => {
        await speichereKanal('twitch-kanal', 'c9');
        expect(twitchUserService.setNotificationChannel).toHaveBeenCalledWith('c9');

        await speichereKanal('morgengruss-kanal', 'c8');
        expect(greetingService.setChannel).toHaveBeenCalledWith('c8');
    });
});

describe('config.settings – Twitch-Rolle (bearbeiten)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mitRollen = () => {
        (client.guilds as any).cache = new Map([['guild-1', {
            id: 'guild-1',
            roles: {
                cache: new Collection<string, any>([
                    ['guild-1', {id: 'guild-1', name: '@everyone'}],
                    ['r2', {id: 'r2', name: 'Zuschauer'}],
                    ['r1', {id: 'r1', name: 'Abonnenten'}],
                ])
            }
        }]]);
    };

    it('holeRollen liefert alle Rollen außer @everyone, alphabetisch', () => {
        mitRollen();
        expect(holeRollen().map(r => r.name)).toEqual(['Abonnenten', 'Zuschauer']);
    });

    it('istGueltigeRolle akzeptiert echte Rollen, nicht @everyone', () => {
        mitRollen();
        expect(istGueltigeRolle('r1')).toBe(true);
        expect(istGueltigeRolle('guild-1')).toBe(false);
        expect(istGueltigeRolle('fremd')).toBe(false);
    });

    it('speichereTwitchRolle setzt eine Rolle bzw. entfernt sie bei null', async () => {
        await speichereTwitchRolle('r1');
        expect(twitchUserService.setNotificationRole).toHaveBeenCalledWith('r1');
        expect(twitchUserService.removeNotificationRole).not.toHaveBeenCalled();

        await speichereTwitchRolle(null);
        expect(twitchUserService.removeNotificationRole).toHaveBeenCalledTimes(1);
    });
});

describe('config.settings – Event (bearbeiten)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('holeEventFelder liefert leere Felder, wenn kein Event gesetzt ist', async () => {
        (eventService.getEvent as any).mockResolvedValue(null);
        expect(await holeEventFelder()).toEqual({datum: '', uhrzeit: '', titel: ''});
    });

    it('holeEventFelder wandelt einen Timestamp in native Datums-/Zeit-Felder', async () => {
        // Lokale Zeit (Host/Test = Europe/Berlin): 24.12.2026 18:30
        const ts = new Date(2026, 11, 24, 18, 30).getTime();
        (eventService.getEvent as any).mockResolvedValue({timestamp: ts, title: 'Weihnachtstreffen'});

        expect(await holeEventFelder()).toEqual({datum: '2026-12-24', uhrzeit: '18:30', titel: 'Weihnachtstreffen'});
    });

    it('speichereEventDaten und entferneEvent reichen an den Service durch', async () => {
        await speichereEventDaten(123, 'Titel');
        expect(eventService.setEvent).toHaveBeenCalledWith(123, 'Titel');

        await entferneEvent();
        expect(eventService.clearEvent).toHaveBeenCalledTimes(1);
    });
});

describe('config.settings – Sport-Admin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mitMitgliedern = () => {
        (client.guilds as any).cache = new Map([['guild-1', {
            members: {
                cache: new Collection<string, any>([
                    ['m2', {id: 'm2', displayName: 'Zerix', user: {bot: false}}],
                    ['m1', {id: 'm1', displayName: 'Acaine', user: {bot: false}}],
                    ['b1', {id: 'b1', displayName: 'DracheBot', user: {bot: true}}],
                ])
            }
        }]]);
    };

    it('holeMitglieder liefert Mitglieder ohne Bots, alphabetisch', () => {
        mitMitgliedern();
        expect(holeMitglieder().map(m => m.name)).toEqual(['Acaine', 'Zerix']);
    });

    it('istGueltigesMitglied akzeptiert nur echte Mitglieder (keine Bots)', () => {
        mitMitgliedern();
        expect(istGueltigesMitglied('m1')).toBe(true);
        expect(istGueltigesMitglied('b1')).toBe(false);
        expect(istGueltigesMitglied('fremd')).toBe(false);
    });

    it('reicht Kilometer-/Bestandskilometer-Aktionen an den Service durch', async () => {
        await speichereKilometer('m1', 42);
        expect(sportService.setKilometer).toHaveBeenCalledWith('m1', 42);

        await addiereLegacyKilometer(10);
        expect(sportService.addLegacyKilometer).toHaveBeenCalledWith(10);

        await setzeLegacyKilometer(0);
        expect(sportService.setLegacyKilometer).toHaveBeenCalledWith(0);

        (sportService.getLegacyKilometer as any).mockResolvedValue(1250);
        expect(await holeLegacyKilometer()).toBe(1250);
    });

    it('reicht Meilenstein-Aktionen an den Service durch', async () => {
        (sportService.getMilestones as any).mockResolvedValue([{kilometers: 1000, text: 'x', announced: false}]);
        expect(await holeMeilensteine()).toEqual([{kilometers: 1000, text: 'x', announced: false}]);

        await entferneMeilenstein(2000);
        expect(sportService.removeMilestone).toHaveBeenCalledWith(2000);
    });
});
