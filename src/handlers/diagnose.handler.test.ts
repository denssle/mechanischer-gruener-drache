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
const character = vi.hoisted(() => ({ getAllLinks: vi.fn(), getRoster: vi.fn() }));
const oauth = vi.hoisted(() => ({ oauthConfigured: vi.fn() }));
const geburtstag = vi.hoisted(() => ({ getChannel: vi.fn(async () => null) }));
const drachen = vi.hoisted(() => ({ getChannel: vi.fn(async () => null) }));
const rollenhinweis = vi.hoisted(() => ({
    getChannel: vi.fn(async (): Promise<string | null> => null),
    getRollenKanal: vi.fn(async (): Promise<string | null> => null),
    getWillkommensKanal: vi.fn(async (): Promise<string | null> => null),
    getHauptrolle: vi.fn(async (): Promise<string | null> => null),
    getHingewiesene: vi.fn(async (): Promise<string[]> => []),
}));
const session = vi.hoisted(() => ({ sessionConfigured: vi.fn() }));
const pingPong = vi.hoisted(() => ({ getLastSeason: vi.fn(), getChampionRole: vi.fn() }));
const channelsFetch = vi.hoisted(() => vi.fn());
const guildsCache = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../client.js', () => ({ default: { channels: { fetch: channelsFetch }, guilds: { cache: guildsCache } } }));
vi.mock('../services/twitch.user.service.js', () => ({ default: twitchUser }));
vi.mock('../services/twitch.service.js', () => ({ default: twitch }));
vi.mock('../services/sport.service.js', () => ({ default: sport }));
vi.mock('../services/logging.service.js', () => ({ default: logging }));
vi.mock('../services/greeting.service.js', () => ({ default: greeting }));
vi.mock('../services/geburtstag.service.js', () => ({ default: geburtstag }));
vi.mock('../services/drachen.service.js', () => ({ default: drachen }));
vi.mock('../services/rollenhinweis.service.js', () => ({ default: rollenhinweis }));
vi.mock('../services/fehlerMeldung.service.js', () => ({ default: { getChannel: vi.fn(async () => null) } }));
vi.mock('../services/event.service.js', () => ({ default: event }));
vi.mock('../services/pingPong.service.js', () => ({ default: pingPong }));
vi.mock('../services/discordOAuth.service.js', () => oauth);
vi.mock('../server/config.session.js', () => session);
// findInRoster (rein) real lassen, nur den Service-Default mocken.
vi.mock('../services/character.service.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/character.service.js')>();
    return { ...actual, default: character };
});

import {Collection, PermissionFlagsBits} from 'discord.js';
import diagnoseHandler, {zaehleOhneRolle} from './diagnose.handler.js';
import config from '../../config.json' with { type: 'json' };

function makeInteraction(isAdmin = true) {
    return {
        memberPermissions: { has: () => isAdmin },
        reply: vi.fn(),
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn(),
        followUp: vi.fn(),
    } as any;
}

const report = (interaction: any) => interaction.editReply.mock.calls[0][0] as string;

const TAG = 24 * 60 * 60 * 1000;
const JETZT = Date.UTC(2026, 10, 7);

// Rollen-Cache wie bei discord.js: @everyone (ID = Guild-ID) ist immer drin.
const mockMitglied = (id: string, rollen: string[] = [], vorTagen = 1, bot = false) => ({
    id,
    user: {bot},
    joinedTimestamp: JETZT - vorTagen * TAG,
    roles: {cache: new Collection([config.GUILD_ID, ...rollen].map(rolle => [rolle, {id: rolle}]))},
}) as any;

const mockGuild = (mitglieder: any[] = [], rollen: string[] = []) => ({
    id: config.GUILD_ID,
    roles: {cache: new Map(rollen.map(rolle => [rolle, {id: rolle}])), everyone: {id: config.GUILD_ID}},
    members: {
        me: {permissions: {has: () => true}},
        fetch: vi.fn(async () => new Map(mitglieder.map(mitglied => [mitglied.id, mitglied]))),
    },
});

describe('zaehleOhneRolle', () => {
    const hatRolle = (mitglied: any) => mitglied.roles.cache.has('haupt');

    it('teilt nach Beitritt auf und lässt Bots und Leute mit Rolle weg', () => {
        const stand = zaehleOhneRolle([
            mockMitglied('a', [], 30),
            mockMitglied('b', [], 31),
            mockMitglied('c', [], 365),
            mockMitglied('d', [], 366),
            mockMitglied('e', ['haupt'], 1),
            mockMitglied('bot', [], 1, true),
        ], hatRolle, new Set(['b', 'e']), JETZT);

        expect(stand).toEqual({gesamt: 5, ohneRolle: 4, letzte30Tage: 1, letztesJahr: 2, aelter: 1, hingewiesen: 1});
    });

    it('zählt ein fehlendes Beitrittsdatum als alt', () => {
        const stand = zaehleOhneRolle([{...mockMitglied('a'), joinedTimestamp: null}], hatRolle, new Set(), JETZT);

        expect(stand.aelter).toBe(1);
    });
});

describe('DiagnoseHandler', () => {
    beforeEach(() => {
        [twitchUser, twitch, sport, logging, greeting, event, character, pingPong].forEach(svc =>
            Object.values(svc).forEach(fn => (fn as any).mockReset())
        );
        channelsFetch.mockReset();
        // Standard: nichts gesetzt
        twitchUser.getNotificationChannel.mockResolvedValue(null);
        twitchUser.getNotificationRole.mockResolvedValue(null);
        twitchUser.getAllLinks.mockResolvedValue([]);
        twitch.listStreamOnlineSubscriptions.mockResolvedValue([]);
        pingPong.getLastSeason.mockResolvedValue(null);
        pingPong.getChampionRole.mockResolvedValue(null);
        sport.getAnnouncementChannel.mockResolvedValue(null);
        logging.getLogChannel.mockResolvedValue(null);
        greeting.getChannel.mockResolvedValue(null);
        event.getEvent.mockResolvedValue(null);
        character.getAllLinks.mockResolvedValue([]);
        character.getRoster.mockResolvedValue([]);
        channelsFetch.mockResolvedValue({ id: 'ok' });
        // Standard: Config-Login konfiguriert
        oauth.oauthConfigured.mockReturnValue(true);
        session.sessionConfigured.mockReturnValue(true);
        // Standard: Bot darf das Audit-Log lesen
        guildsCache.clear();
        guildsCache.set(config.GUILD_ID, mockGuild());
    });

    describe('Mitglieder ohne Rolle', () => {
        beforeEach(() => {
            rollenhinweis.getHauptrolle.mockResolvedValue(null);
            rollenhinweis.getHingewiesene.mockResolvedValue([]);
            rollenhinweis.getWillkommensKanal.mockResolvedValue(null);
            rollenhinweis.getChannel.mockResolvedValue(null);
            rollenhinweis.getRollenKanal.mockResolvedValue(null);
        });

        it('zählt ohne Hauptrolle, wer gar keine Rolle hat', async () => {
            guildsCache.set(config.GUILD_ID, mockGuild([mockMitglied('a'), mockMitglied('b', ['twitch'])]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Hauptrolle: ℹ️ nicht gesetzt');
            expect(report(interaction)).toContain('Ohne Rolle: 1 von 2 (ohne Bots)');
        });

        it('zählt mit Hauptrolle auch Leute, die nur eine andere Rolle haben', async () => {
            rollenhinweis.getHauptrolle.mockResolvedValue('haupt');
            rollenhinweis.getHingewiesene.mockResolvedValue(['a']);
            guildsCache.set(config.GUILD_ID, mockGuild(
                [mockMitglied('a'), mockMitglied('b', ['twitch']), mockMitglied('c', ['haupt'])],
                ['haupt', 'twitch'],
            ));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Hauptrolle: ✅ <@&haupt>');
            expect(report(interaction)).toContain('Ohne Rolle: 2 von 3 (ohne Bots)');
            expect(report(interaction)).toContain('Rollenhinweis bekommen: 1, noch nicht: 1');
        });

        it('fällt bei einer gelöschten Hauptrolle auf "gar keine Rolle" zurück', async () => {
            rollenhinweis.getHauptrolle.mockResolvedValue('weg');
            guildsCache.set(config.GUILD_ID, mockGuild([mockMitglied('a'), mockMitglied('b', ['twitch'])]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('aber nicht (mehr) vorhanden');
            expect(report(interaction)).toContain('Ohne Rolle: 1 von 2 (ohne Bots)');
        });

        it('überlebt einen gescheiterten Abruf der Mitglieder', async () => {
            const guild = mockGuild();
            guild.members.fetch.mockRejectedValue(new Error('Rate limit'));
            guildsCache.set(config.GUILD_ID, guild);
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('⚠️ Mitglieder konnten nicht ausgewertet werden.');
            expect(report(interaction)).toContain('**Config-Seite (/config)**');
        });

        // Der Bot (members.me) und @everyone (roles.everyone) bekommen getrennte Rechte, damit die
        // Tests sehen, wer gemeint ist.
        const mockKanal = (rechteOhneRolle: bigint[], rechteBot: bigint[]) => ({
            id: 'kanal',
            permissionsFor: (wer: {id?: string}) => ({
                has: (recht: bigint) => (wer.id === config.GUILD_ID ? rechteOhneRolle : rechteBot).includes(recht),
            }),
        });
        const {ViewChannel, SendMessages, ReadMessageHistory} = PermissionFlagsBits;

        it('warnt, wenn Leute ohne Rolle den Willkommens-Kanal nicht sehen', async () => {
            rollenhinweis.getWillkommensKanal.mockResolvedValue('kanal-gruss');
            channelsFetch.mockResolvedValue(mockKanal([], [ViewChannel, SendMessages]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Willkommensgruß: ⚠️ <#kanal-gruss>, Leuten ohne Rolle fehlt: Kanal sehen, Nachrichtenverlauf lesen');
        });

        it('warnt, wenn der Bot im Willkommens-Kanal nicht schreiben darf', async () => {
            rollenhinweis.getWillkommensKanal.mockResolvedValue('kanal-gruss');
            channelsFetch.mockResolvedValue(mockKanal([ViewChannel, ReadMessageHistory], [ViewChannel]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Willkommensgruß: ⚠️ <#kanal-gruss>, mir fehlt: Nachrichten senden');
        });

        it('warnt, wenn Leute ohne Rolle im Hinweis-Kanal nicht schreiben dürfen', async () => {
            rollenhinweis.getChannel.mockResolvedValue('kanal-hinweis');
            channelsFetch.mockResolvedValue(mockKanal([ViewChannel], [ViewChannel, SendMessages, ReadMessageHistory]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Rollenhinweis-Kanal: ⚠️ <#kanal-hinweis>, Leuten ohne Rolle fehlt: Nachrichten senden');
        });

        it('warnt, wenn Leute ohne Rolle den Verlauf im Rollen-Kanal nicht lesen dürfen', async () => {
            rollenhinweis.getRollenKanal.mockResolvedValue('kanal-rollen');
            channelsFetch.mockResolvedValue(mockKanal([ViewChannel], [ViewChannel]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Kanal mit dem Rollen-Button: ⚠️ <#kanal-rollen>, Leuten ohne Rolle fehlt: Nachrichtenverlauf lesen');
        });

        it('zeigt ein Grün, wenn alle nötigen Rechte da sind', async () => {
            rollenhinweis.getWillkommensKanal.mockResolvedValue('kanal-gruss');
            channelsFetch.mockResolvedValue(mockKanal([ViewChannel, ReadMessageHistory], [ViewChannel, SendMessages]));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Willkommensgruß: ✅ <#kanal-gruss>');
        });
    });

    it('teilt einen langen Bericht auf, ohne Zeilen zu verlieren', async () => {
        character.getAllLinks.mockResolvedValue(Array.from({length: 25}, (_, i) => ({
            discordUserId: `10000000000000000${i}`, name: `Charakter Mit Langem Namen ${i}`,
        })));
        character.getRoster.mockResolvedValue([]);
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        const teile = [report(interaction), ...interaction.followUp.mock.calls.map((aufruf: any) => aufruf[0].content)];
        expect(teile.length).toBeGreaterThan(1);
        expect(teile.every((teil: string) => teil.length <= 2000)).toBe(true);
        expect(teile.join('\n')).toContain('**Config-Seite (/config)**');
    });

    it('warnt vor mehrfach verknüpften Charakteren', async () => {
        character.getAllLinks.mockResolvedValue([
            {discordUserId: 'a', name: 'Acaine'}, {discordUserId: 'b', name: 'acaine'},
        ]);
        character.getRoster.mockResolvedValue([{name: 'Centurio Acaine'}]);
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        expect(report(interaction)).toContain('1 Charakter(e) sind mehrfach verknüpft');
    });

    it('zeigt den optionalen Kanal mit dem Rollen-Button leer ohne Fehlermarker', async () => {
        rollenhinweis.getRollenKanal.mockResolvedValue(null);
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        expect(report(interaction)).toContain('Kanal mit dem Rollen-Button: ℹ️ nicht gesetzt (optional)');
    });

    it('prüft den Kanal mit dem Rollen-Button, wenn er gesetzt ist', async () => {
        rollenhinweis.getRollenKanal.mockResolvedValueOnce('kanal-rollen');
        channelsFetch.mockRejectedValue(new Error('Unknown Channel'));
        const interaction = makeInteraction();

        await diagnoseHandler.handleDiagnose(interaction);

        expect(report(interaction)).toMatch(/Kanal mit dem Rollen-Button: ⚠️/);
    });

    // Die Champion-Rolle wird am Monatswechsel automatisch weitergereicht - scheitert das, wird es
    // nur geloggt. Im Discord sieht man davon nichts, deshalb steht es hier.
    describe('Ping-Pong-Season', () => {
        const mitRolle = (opts: {rolleDa?: boolean; manageRoles?: boolean; hoeher?: boolean} = {}) => {
            const {rolleDa = true, manageRoles = true, hoeher = true} = opts;
            guildsCache.set(config.GUILD_ID, {
                roles: {cache: rolleDa ? new Map([['rolle-1', {id: 'rolle-1'}]]) : new Map()},
                members: {
                    me: {
                        permissions: {has: (recht: unknown) => recht === undefined ? true : manageRoles},
                        roles: {highest: {comparePositionTo: () => hoeher ? 1 : -1}},
                    }
                },
            });
        };

        it('meldet eine fehlende Champion-Rolle als ❌', async () => {
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Champion-Rolle: ❌ nicht gesetzt');
        });

        it('nennt den zuletzt abgerechneten Monat', async () => {
            pingPong.getLastSeason.mockResolvedValue('2026-06');
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Zuletzt abgerechnet: ✅ Juni 2026');
        });

        it('warnt bei gesetzter, aber gelöschter Rolle', async () => {
            pingPong.getChampionRole.mockResolvedValue('rolle-1');
            mitRolle({rolleDa: false});
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Champion-Rolle: ⚠️');
        });

        it('warnt, wenn dem Bot "Rollen verwalten" fehlt', async () => {
            pingPong.getChampionRole.mockResolvedValue('rolle-1');
            mitRolle({manageRoles: false});
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Rollen verwalten');
        });

        it('warnt, wenn die Champion-Rolle über der Bot-Rolle steht', async () => {
            pingPong.getChampionRole.mockResolvedValue('rolle-1');
            mitRolle({hoeher: false});
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Hierarchie');
        });

        it('meldet eine vollständig eingerichtete Rolle als ✅', async () => {
            pingPong.getChampionRole.mockResolvedValue('rolle-1');
            mitRolle();
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Champion-Rolle: ✅ <@&rolle-1>');
            expect(report(interaction)).not.toContain('Rollen verwalten');
        });
    });

    describe('Audit-Log-Recht', () => {
        it('meldet vorhandenes Recht als ok', async () => {
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Audit-Log-Zugriff: ✅');
        });

        it('warnt, wenn dem Bot das Recht fehlt', async () => {
            guildsCache.set(config.GUILD_ID, { members: { me: { permissions: { has: () => false } } } });
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Audit-Log ansehen" fehlt');
        });

        it('kommt ohne gecachten Server klar', async () => {
            guildsCache.clear();
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Audit-Log-Zugriff: ⚠️');
        });
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

    describe('Config-Seite', () => {
        it('meldet den Login als konfiguriert, wenn beide Secrets gesetzt sind', async () => {
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Login konfiguriert');
        });

        // Die URL steht sonst NIRGENDS im Bot (die Seite hat bewusst keinen eigenen Command) -
        // Admins mussten sie auswendig kennen.
        it('nennt die Adresse der Verwaltungsseite', async () => {
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('/config');
        });

        it('nennt das fehlende Secret, wenn der Login nicht konfiguriert ist', async () => {
            oauth.oauthConfigured.mockReturnValue(true);
            session.sessionConfigured.mockReturnValue(false);
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            const text = report(interaction);
            expect(text).toContain('Login NICHT konfiguriert');
            expect(text).toContain('CONFIG_SESSION_SECRET');
        });
    });

    describe('verknüpfte Charaktere', () => {
        it('zählt die Verknüpfungen und meldet 0, wenn keine da sind', async () => {
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            const text = report(interaction);
            expect(text).toContain('**Verknüpfte Charaktere**');
            expect(text).toContain('Anzahl: 0');
        });

        it('markiert einen im Roster gefundenen Charakter mit ✅ (Titel-Präfix egal)', async () => {
            character.getAllLinks.mockResolvedValue([{ discordUserId: 'd1', name: 'Acaine' }]);
            character.getRoster.mockResolvedValue([{ name: 'Centurio Acaine' }]);
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            const text = report(interaction);
            expect(text).toContain('✅ **Acaine** (<@d1>)');
            expect(text).toContain('Centurio Acaine');
        });

        it('markiert eine verwaiste Verknüpfung als ⚠️ und fasst sie zusammen', async () => {
            character.getAllLinks.mockResolvedValue([{ discordUserId: 'd1', name: 'Weg' }]);
            character.getRoster.mockResolvedValue([{ name: 'Centurio Acaine' }]);
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            const text = report(interaction);
            expect(text).toContain('⚠️ **Weg** (<@d1>) – nicht (mehr) im Roster gefunden');
            expect(text).toContain('1 Verknüpfung(en) ohne Roster-Treffer');
        });

        it('meldet, wenn das Roster nicht abrufbar ist (Links trotzdem gezählt)', async () => {
            character.getAllLinks.mockResolvedValue([{ discordUserId: 'd1', name: 'Acaine' }]);
            character.getRoster.mockResolvedValue(null);
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            const text = report(interaction);
            expect(text).toContain('Anzahl: 1');
            expect(text).toContain('Roster nicht abrufbar');
        });

        it('übersteht ein Redis-Problem bei den Verknüpfungen', async () => {
            character.getAllLinks.mockRejectedValue(new Error('Redis weg'));
            const interaction = makeInteraction();

            await diagnoseHandler.handleDiagnose(interaction);

            expect(report(interaction)).toContain('Verknüpfungen konnten nicht geladen werden');
        });
    });
});
