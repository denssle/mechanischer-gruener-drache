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
        getMilestones: vi.fn(), removeMilestone: vi.fn(),
        getAlleKilometer: vi.fn(async () => ({}))
    }
}));
vi.mock('../handlers/sport.handler.js', () => ({
    default: {announceReachedMilestones: vi.fn()}
}));
vi.mock('../services/logging.service.js', () => ({
    default: {getLogChannel: vi.fn(), setLogChannel: vi.fn()}
}));
vi.mock('../services/greeting.service.js', () => ({
    default: {
        getChannel: vi.fn(), setChannel: vi.fn(),
        getLearnedEmojis: vi.fn(async () => ({})), setLearnedEmoji: vi.fn(),
        getManualEmojis: vi.fn(async () => ({})), setManualEmoji: vi.fn()
    }
}));
vi.mock('../services/geburtstag.service.js', () => ({
    default: {getChannel: vi.fn(async () => null), setChannel: vi.fn()}
}));
vi.mock('../services/drachen.service.js', () => ({
    default: {getChannel: vi.fn(async () => null), setChannel: vi.fn()}
}));
vi.mock('../services/event.service.js', () => ({
    default: {getEvent: vi.fn(), setEvent: vi.fn(), clearEvent: vi.fn()}
}));
vi.mock('../services/pingPong.service.js', () => ({
    default: {
        getChampionRole: vi.fn(async () => null), setChampionRole: vi.fn(), removeChampionRole: vi.fn()
    }
}));

import client from '../client.js';
import twitchUserService from '../services/twitch.user.service.js';
import sportService from '../services/sport.service.js';
import sportHandler from '../handlers/sport.handler.js';
import {ableiteEmoji, GRUSS_EMOJIS} from '../handlers/greeting.handler.js';
import {EMOJI_SHORTCODES} from '../data/emoji-shortcodes.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import eventService from '../services/event.service.js';
import pingPongService from '../services/pingPong.service.js';
import {ChannelType, Collection} from 'discord.js';
import {
    addiereLegacyKilometer,
    entferneEvent,
    entferneMeilenstein,
    holeEventFelder,
    holeLegacyKilometer,
    holeMeilensteine,
    holeMitglieder,
    deuteEmojiEingabe,
    holeEmojiVorschlaege,
    holeMorgengrussEmojis,
    holeRollen,
    holeTextKanaele,
    istRollenFeld,
    ladeRollenFelder,
    istGueltigerTextKanal,
    istGueltigeRolle,
    istGueltigesMitglied,
    istKanalFeld,
    ladeKanalFelder,
    setzeLegacyKilometer,
    speichereEventDaten,
    speichereKanal,
    speichereKilometer,
    speichereMorgengrussEmoji,
    speichereRolle
} from './config.settings.js';

describe('config.settings – Kanal-Liste', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (client.guilds as any).cache = new Map();
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
        (client.channels.fetch as any).mockResolvedValue({name: 'irgendwas'});

        const felder = await ladeKanalFelder();
        expect(felder.map(f => f.schluessel)).toEqual(['protokoll', 'twitch-kanal', 'sport-kanal', 'morgengruss-kanal', 'geburtstag-kanal', 'spielwelt-kanal']);
        expect(felder.find(f => f.schluessel === 'protokoll')!.aktuelleId).toBe('log-1');
        expect(felder.find(f => f.schluessel === 'sport-kanal')!.aktuelleId).toBe('sport-1');
        expect(felder.find(f => f.schluessel === 'twitch-kanal')!.aktuelleId).toBeNull();
    });

    // Der Zustand hing bis 2026-07-26 an der separaten read-only-Tabelle (sammleEinstellungen) und
    // wurde dafür ein zweites Mal aus Redis gelesen; jetzt trägt ihn das Feld selbst.
    it('ladeKanalFelder markiert nicht gesetzte Felder als leer', async () => {
        (loggingService.getLogChannel as any).mockResolvedValue(null);
        (twitchUserService.getNotificationChannel as any).mockResolvedValue(null);
        (sportService.getAnnouncementChannel as any).mockResolvedValue(null);
        (greetingService.getChannel as any).mockResolvedValue(null);

        const felder = await ladeKanalFelder();
        expect(felder.every(f => f.status === 'leer')).toBe(true);
        // Kein Abruf-Versuch ohne ID.
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('ladeKanalFelder markiert einen gesetzten, aber nicht abrufbaren Kanal als Warnung', async () => {
        (loggingService.getLogChannel as any).mockResolvedValue('chan-weg');
        (twitchUserService.getNotificationChannel as any).mockResolvedValue(null);
        (sportService.getAnnouncementChannel as any).mockResolvedValue(null);
        (greetingService.getChannel as any).mockResolvedValue(null);
        (client.channels.fetch as any).mockRejectedValue(new Error('unbekannt'));

        const protokoll = (await ladeKanalFelder()).find(f => f.schluessel === 'protokoll')!;
        expect(protokoll.status).toBe('warnung');
        expect(protokoll.aktuelleId).toBe('chan-weg');
    });

    it('ladeKanalFelder markiert einen abrufbaren Kanal als ok', async () => {
        (loggingService.getLogChannel as any).mockResolvedValue('log-1');
        (twitchUserService.getNotificationChannel as any).mockResolvedValue(null);
        (sportService.getAnnouncementChannel as any).mockResolvedValue(null);
        (greetingService.getChannel as any).mockResolvedValue(null);
        (client.channels.fetch as any).mockResolvedValue({name: 'protokoll'});

        const protokoll = (await ladeKanalFelder()).find(f => f.schluessel === 'protokoll')!;
        expect(protokoll.status).toBe('ok');
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

    it('ladeRollenFelder liefert beide Rollen mit ID + Zustand (ok / leer / warnung)', async () => {
        mitRollen();

        (twitchUserService.getNotificationRole as any).mockResolvedValue('r1');
        (pingPongService.getChampionRole as any).mockResolvedValue(null);
        expect(await ladeRollenFelder()).toEqual([
            {schluessel: 'twitch-rolle', label: 'Twitch-Benachrichtigungsrolle', aktuelleId: 'r1', status: 'ok'},
            // Nicht gesetzt ist bei den optionalen Rollen kein Mangel.
            {schluessel: 'pingpong-champion', label: 'Champion-Rolle', aktuelleId: null, status: 'leer'},
        ]);

        // Gesetzt, aber die Rolle gibt es nicht mehr.
        (pingPongService.getChampionRole as any).mockResolvedValue('r-weg');
        const felder = await ladeRollenFelder();
        expect(felder.find(f => f.schluessel === 'pingpong-champion'))
            .toEqual({schluessel: 'pingpong-champion', label: 'Champion-Rolle', aktuelleId: 'r-weg', status: 'warnung'});
    });

    it('istRollenFeld kennt nur die beiden Rollen-Einstellungen', () => {
        expect(istRollenFeld('twitch-rolle')).toBe(true);
        expect(istRollenFeld('pingpong-champion')).toBe(true);
        expect(istRollenFeld('ausgedacht')).toBe(false);
        // hasOwnProperty statt direktem Zugriff: sonst landete das in der Prototypenkette.
        expect(istRollenFeld('constructor')).toBe(false);
    });

    it('speichereRolle setzt eine Rolle bzw. entfernt sie bei null', async () => {
        await speichereRolle('twitch-rolle', 'r1');
        expect(twitchUserService.setNotificationRole).toHaveBeenCalledWith('r1');
        expect(twitchUserService.removeNotificationRole).not.toHaveBeenCalled();

        await speichereRolle('twitch-rolle', null);
        expect(twitchUserService.removeNotificationRole).toHaveBeenCalledTimes(1);

        await speichereRolle('pingpong-champion', 'r2');
        expect(pingPongService.setChampionRole).toHaveBeenCalledWith('r2');

        await speichereRolle('pingpong-champion', null);
        expect(pingPongService.removeChampionRole).toHaveBeenCalledTimes(1);
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

    it('holeMitglieder liefert Mitglieder ohne Bots, alphabetisch', async () => {
        mitMitgliedern();
        expect((await holeMitglieder()).map(m => m.name)).toEqual(['Acaine', 'Zerix']);
    });

    it('holeMitglieder hängt den aktuellen Kilometerstand an (ohne Eintrag: 0)', async () => {
        mitMitgliedern();
        (sportService.getAlleKilometer as any).mockResolvedValue({m1: 128.5, LEGACY_KILOMETERS: 1250});
        expect(await holeMitglieder()).toEqual([
            {id: 'm1', name: 'Acaine', kilometer: 128.5},
            {id: 'm2', name: 'Zerix', kilometer: 0},
        ]);
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

    // Regression: vor der /config-Migration hing die Meilenstein-Prüfung an den Admin-Commands
    // (/sport setzen, /altkilometer, /altkilometer-setzen). Die sind entfernt - ohne den Aufruf hier
    // bliebe eine überschrittene Schwelle liegen, bis zufällig jemand anders etwas einträgt.
    it('stößt nach jeder summen-erhöhenden Aktion die Meilenstein-Prüfung an', async () => {
        await speichereKilometer('m1', 42);
        await addiereLegacyKilometer(10);
        await setzeLegacyKilometer(500);
        expect(sportHandler.announceReachedMilestones).toHaveBeenCalledTimes(3);
    });

    it('prüft Meilensteine NICHT beim Entfernen eines Meilensteins', async () => {
        await entferneMeilenstein(2000);
        expect(sportHandler.announceReachedMilestones).not.toHaveBeenCalled();
    });
});

describe('config.settings – Morgengruß-Emojis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // clearAllMocks löscht nur die Aufrufe, nicht die Rückgaben - ohne diesen Default würde die
        // Handeingabe eines Tests in alle folgenden lecken.
        (greetingService.getManualEmojis as any).mockResolvedValue({});
    });

    // Mitglieder + Server-Emojis; das Custom-Emoji "blahaj" liegt unter der ID 555.
    const mitServer = () => {
        (client.guilds as any).cache = new Map([['guild-1', {
            members: {
                cache: new Collection<string, any>([
                    ['m1', {id: 'm1', displayName: 'Tirsis', user: {bot: false}}],
                    ['m2', {id: 'm2', displayName: 'Zerix', user: {bot: false}}],
                    ['m3', {id: 'm3', displayName: 'Acaine', user: {bot: false}}],
                    ['b1', {id: 'b1', displayName: 'DracheBot', user: {bot: true}}],
                ])
            },
            emojis: {
                cache: new Collection<string, any>([
                    ['555', {id: '555', name: 'blahaj', imageURL: () => 'https://cdn/555.png'}],
                    ['1336646220168433674', {id: '1336646220168433674', name: 'blahaj', imageURL: () => 'https://cdn/echt.png'}],
                ])
            }
        }]]);
    };

    it('nimmt das gelernte Unicode-Emoji und markiert es als gelernt', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: '🦊'});

        const tirsis = (await holeMorgengrussEmojis()).find(e => e.id === 'm1')!;
        expect(tirsis.herkunft).toBe('gelernt');
        expect(tirsis.emoji).toEqual({art: 'unicode', zeichen: '🦊'});
    });

    // Ohne Gelerntes greift beim Gruß ableiteEmoji - diese Leute gehören mit in die Übersicht,
    // sonst fehlte die halbe Belegschaft. Aber erkennbar als Fallback.
    it('fällt auf das abgeleitete Emoji zurück und markiert es als abgeleitet', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({});

        const eintraege = await holeMorgengrussEmojis();
        expect(eintraege).toHaveLength(3);
        expect(eintraege.every(e => e.herkunft === 'abgeleitet')).toBe(true);
        // Deterministisch aus der User-ID, also identisch zu dem, was der Gruß verwenden würde.
        expect(eintraege.find(e => e.id === 'm1')!.emoji).toEqual({
            art: 'unicode', zeichen: ableiteEmoji('m1')
        });
    });

    // Der dritte Zustand: von Hand gesetzt. Er schlägt das Gelernte - dieselbe Rangfolge wie beim
    // Gruß selbst, sonst zeigte die Seite etwas anderes an, als der Bot am Morgen reagiert.
    it('bevorzugt das manuell gesetzte Emoji vor dem gelernten', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: '🦊'});
        (greetingService.getManualEmojis as any).mockResolvedValue({m1: '🍪'});

        const tirsis = (await holeMorgengrussEmojis()).find(e => e.id === 'm1')!;
        expect(tirsis.herkunft).toBe('manuell');
        expect(tirsis.emoji).toEqual({art: 'unicode', zeichen: '🍪'});
        expect(tirsis.eingabeWert).toBe('🍪');
    });

    it('markiert manuell gesetzte Emojis auch ohne Gelerntes als manuell', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({});
        (greetingService.getManualEmojis as any).mockResolvedValue({m2: '🍪'});

        const eintraege = await holeMorgengrussEmojis();
        expect(eintraege.find(e => e.id === 'm2')!.herkunft).toBe('manuell');
        expect(eintraege.find(e => e.id === 'm1')!.herkunft).toBe('abgeleitet');
    });

    // Custom-Emojis liegen als blanke Snowflake-ID im Hash - ohne Auflösung stünde in der Tabelle
    // nur eine Zahl.
    it('löst eine gespeicherte Emoji-ID zum Server-Emoji auf', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({m2: '555'});

        const zerix = (await holeMorgengrussEmojis()).find(e => e.id === 'm2')!;
        expect(zerix.emoji).toEqual({art: 'custom', url: 'https://cdn/555.png', name: 'blahaj'});
    });

    it('meldet eine ID als unbekannt, wenn es das Server-Emoji nicht mehr gibt', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({m2: '999'});

        const zerix = (await holeMorgengrussEmojis()).find(e => e.id === 'm2')!;
        expect(zerix.emoji).toEqual({art: 'unbekannt', id: '999'});
    });

    it('lässt Bots aus der Übersicht', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({});

        expect((await holeMorgengrussEmojis()).map(e => e.id)).not.toContain('b1');
    });

    // Ein Redis-Problem darf die ganze Seite nicht kosten - dann eben alles abgeleitet.
    it('bleibt bei einem Redis-Fehler bei den abgeleiteten Emojis', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockRejectedValue(new Error('Redis weg'));

        const eintraege = await holeMorgengrussEmojis();
        expect(eintraege).toHaveLength(3);
        expect(eintraege.every(e => e.herkunft === 'abgeleitet')).toBe(true);
    });

    // Tippbare Form fürs Textfeld: Server-Emojis als :name:, damit man keine ID abschreiben muss.
    it('liefert die tippbare Form für das Eingabefeld', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: '🦊', m2: '555'});

        const eintraege = await holeMorgengrussEmojis();
        expect(eintraege.find(e => e.id === 'm1')!.eingabeWert).toBe('🦊');
        expect(eintraege.find(e => e.id === 'm2')!.eingabeWert).toBe(':blahaj:');
        expect(eintraege.find(e => e.id === 'm3')!.eingabeWert).toBe(ableiteEmoji('m3'));
    });

    // Bei einer kaputten Zuordnung gibt es nichts sinnvoll vorzugeben - leeres Pflichtfeld erzwingt
    // eine bewusste Neueingabe, statt einen unbrauchbaren Wert stehen zu lassen.
    it('lässt das Eingabefeld bei einem gelöschten Server-Emoji leer', async () => {
        mitServer();
        (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: '999'});

        expect((await holeMorgengrussEmojis()).find(e => e.id === 'm1')!.eingabeWert).toBe('');
    });

    describe('holeEmojiVorschlaege', () => {
        it('schlägt Fallback-Pool und Server-Emojis als :name: vor', async () => {
            mitServer();
            (greetingService.getLearnedEmojis as any).mockResolvedValue({});

            const vorschlaege = await holeEmojiVorschlaege();
            for (const zeichen of GRUSS_EMOJIS) {
                expect(vorschlaege).toContain(zeichen);
            }
            expect(vorschlaege).toContain(':blahaj:');
        });

        it('nimmt bereits vergebene Emojis außerhalb des Pools mit auf', async () => {
            mitServer();
            (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: '🦊'});

            expect(await holeEmojiVorschlaege()).toContain('🦊');
        });

        it('nimmt auch manuell gesetzte Emojis als Vorschlag mit auf', async () => {
            mitServer();
            (greetingService.getLearnedEmojis as any).mockResolvedValue({});
            (greetingService.getManualEmojis as any).mockResolvedValue({m1: '🍪'});

            expect(await holeEmojiVorschlaege()).toContain('🍪');
        });

        // Rohe IDs sind nichts, was man tippen würde - die Server-Emojis stehen als :name: drin.
        it('schlägt keine rohen IDs vor', async () => {
            mitServer();
            (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: '555', m2: '999'});

            const vorschlaege = await holeEmojiVorschlaege();
            expect(vorschlaege).not.toContain('555');
            expect(vorschlaege).not.toContain('999');
        });

        it('führt jeden Vorschlag nur einmal auf', async () => {
            mitServer();
            (greetingService.getLearnedEmojis as any).mockResolvedValue({m1: GRUSS_EMOJIS[0]});

            const vorschlaege = await holeEmojiVorschlaege();
            expect(vorschlaege).toHaveLength(new Set(vorschlaege).size);
        });
    });

    // Die Vorschlagsliste ist BEWUSST keine Whitelist mehr: eine geschlossene Auswahl kannte
    // gängige Emojis wie 🍪 nicht. Geprüft wird stattdessen hier.
    describe('deuteEmojiEingabe', () => {
        beforeEach(() => mitServer());

        it.each([
            ['🍪', '🍪'],
            ['🦊', '🦊'],
            ['  🍪  ', '🍪'],           // getrimmt
            ['👩‍💻', '👩‍💻'],              // ZWJ-Sequenz
            ['👍🏽', '👍🏽'],              // mit Hautfarbe
            ['🇩🇪', '🇩🇪'],              // Flagge (Regional Indicators)
            ['☀️', '☀️'],               // mit Variation Selector
        ])('akzeptiert das Unicode-Emoji %s', (eingabe, erwartet) => {
            expect(deuteEmojiEingabe(eingabe)).toBe(erwartet);
        });

        it('löst ein Server-Emoji über :name: zur ID auf', () => {
            expect(deuteEmojiEingabe(':blahaj:')).toBe('555');
        });

        // Was Discord beim Kopieren eines Server-Emojis in die Zwischenablage legt.
        it('versteht das eingefügte Discord-Markup <:name:id>', () => {
            expect(deuteEmojiEingabe('<:blahaj:555>')).toBe('555');
            expect(deuteEmojiEingabe('<a:blahaj:555>')).toBe('555');
        });

        // REGRESSION (bis 2026-08-01): die Längengrenze von 16 Zeichen stand vor der
        // Markup-Prüfung. Eine echte Snowflake hat 17-19 Ziffern, das Markup ist damit IMMER
        // länger - die dokumentierte Einfüge-Form wurde also ausnahmslos abgelehnt. Verdeckt
        // wurde das von der dreistelligen Fantasie-ID im Test darüber, deshalb hier eine echte.
        it('versteht Markup auch mit einer echten (langen) Snowflake', () => {
            expect(deuteEmojiEingabe('<:blahaj:1336646220168433674>')).toBe('1336646220168433674');
        });

        // Der eigentliche Zweck des Fixes: Discord gibt Emojis vielerorts als Shortcode aus.
        it.each([
            [':cookie:', '🍪'],
            [':wave:', '👋'],
            [':sunny:', '☀️'],
            [':FOUR_LEAF_CLOVER:', '🍀'],   // Groß-/Kleinschreibung egal
            [':+1:', '👍'],                  // Shortcodes mit Sonderzeichen
        ])('löst den Standard-Shortcode %s zu %s auf', (eingabe, erwartet) => {
            expect(deuteEmojiEingabe(eingabe)).toBe(erwartet);
        });

        // Sonst änderte sich stillschweigend das Verhalten bestehender Zuordnungen.
        it('lässt bei Namensgleichheit das Server-Emoji gewinnen', () => {
            expect(deuteEmojiEingabe(':blahaj:')).toBe('555');
        });

        it('lehnt einen Shortcode ab, den weder Server noch Tabelle kennen', () => {
            expect(deuteEmojiEingabe(':voellig_erfunden:')).toBeNull();
        });

        // Die Längengrenze gilt weiterhin - nur eben nicht mehr für die :name:-Formen.
        it('lehnt langen Fließtext weiterhin ab', () => {
            expect(deuteEmojiEingabe('das ist ein ganzer satz und kein emoji')).toBeNull();
        });

        // Ein vertippter Tabelleneintrag würde klaglos gespeichert und erst Wochen später beim
        // Gruß an message.react scheitern - hier fällt er sofort auf. Der Round-Trip prüft jeden
        // Wert mit genau den Regeln, nach denen auch eine Direkteingabe beurteilt wird.
        it('jeder Tabellen-Eintrag ist ein Emoji, das die Eingabe-Prüfung besteht', () => {
            for (const [shortcode, zeichen] of Object.entries(EMOJI_SHORTCODES)) {
                expect(deuteEmojiEingabe(zeichen), `Eintrag :${shortcode}:`).toBe(zeichen);
            }
        });

        // Die abgeleiteten Vorgaben sind das, was jemand beim Korrigieren am ehesten nachtippt -
        // die Tabelle behauptet im Kommentar, sie alle zu kennen.
        it('kennt für jedes Pool-Emoji einen Shortcode', () => {
            const bekannt = new Set(Object.values(EMOJI_SHORTCODES));
            for (const zeichen of GRUSS_EMOJIS) {
                expect(bekannt, `Pool-Emoji ${zeichen}`).toContain(zeichen);
            }
        });

        it('lehnt ein Server-Emoji ab, das es nicht gibt', () => {
            expect(deuteEmojiEingabe(':gibtsnicht:')).toBeNull();
            expect(deuteEmojiEingabe('<:erfunden:999>')).toBeNull();
        });

        it.each([
            [''],
            ['   '],
            ['hallo'],
            ['123'],
            ['<script>alert(1)</script>'],
            ['🍪 🦊'],                    // zwei Emojis mit Leerzeichen
            ['a🍪'],                      // Buchstabe dabei
            ['🍪🍪🍪🍪🍪🍪🍪🍪🍪'],        // zu lang
        ])('lehnt "%s" ab', (eingabe) => {
            expect(deuteEmojiEingabe(eingabe)).toBeNull();
        });
    });

    // In den MANUELLEN Hash, nicht in den gelernten: sonst würde der nächste Historien-Scan die
    // Handeingabe überschreiben - genau das soll sie überleben.
    it('speichereMorgengrussEmoji schreibt in den manuellen Hash', async () => {
        await speichereMorgengrussEmoji('m1', '🦊');
        expect(greetingService.setManualEmoji).toHaveBeenCalledWith('m1', '🦊');
        expect(greetingService.setLearnedEmoji).not.toHaveBeenCalled();
    });

    it('reicht Meilenstein-Aktionen an den Service durch', async () => {
        (sportService.getMilestones as any).mockResolvedValue([{kilometers: 1000, text: 'x', announced: false}]);
        expect(await holeMeilensteine()).toEqual([{kilometers: 1000, text: 'x', announced: false}]);

        await entferneMeilenstein(2000);
        expect(sportService.removeMilestone).toHaveBeenCalledWith(2000);
    });
});
