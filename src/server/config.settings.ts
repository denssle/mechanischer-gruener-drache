import {ChannelType, TextChannel} from 'discord.js';
import {SportMilestone} from '../types/sport.js';
import client from '../client.js';
import config from '../../config.json' with {type: 'json'};
import twitchUserService from '../services/twitch.user.service.js';
import sportService from '../services/sport.service.js';
import sportHandler from '../handlers/sport.handler.js';
import loggingService from '../services/logging.service.js';
import greetingService from '../services/greeting.service.js';
import eventService from '../services/event.service.js';
import {ableiteEmoji} from '../handlers/greeting.handler.js';

// Sammelt die auf /config bearbeitbaren Admin-Einstellungen als strukturierte Daten fuers
// Web-Rendering. Jedes Feld traegt seinen aktuellen Wert UND seinen Zustand (siehe FeldStatus) -
// bis 2026-07-26 gab es dafuer zusaetzlich eine read-only-Tabelle (sammleEinstellungen), die
// dieselben Werte ein zweites Mal aus Redis las; der Zustand steht jetzt am jeweiligen Formular.
// client wird nur in Funktionskoerpern benutzt (Zirkular-Import-Falle, wie config.router.ts).

// 'ok' = gesetzt und abrufbar, 'warnung' = gesetzt, aber der Kanal/die Rolle existiert nicht (mehr)
// bzw. der Bot kommt nicht dran, 'leer' = nicht gesetzt.
export type FeldStatus = 'ok' | 'warnung' | 'leer';

export interface KanalOption {
    id: string;
    name: string;
}

// Sortierschluessel: fuehrende Nicht-Buchstaben/-Zahlen (v.a. Emojis, Symbole, Bindestriche)
// ignorieren. Viele Discord-Kanaele beginnen mit einem Emoji ("🎮-gaming"), das sonst die
// alphabetische Ordnung nach dem eigentlichen Namen zerstoert. Der Anzeigename bleibt unveraendert.
function sortierschluessel(name: string): string {
    return name.replace(/^[^\p{L}\p{N}]+/u, '');
}

// Alle beschreibbaren Text-/Announcement-Kanäle des Servers - Grundlage fuers Auswahl-Dropdown
// (statt Kanal-IDs abtippen zu lassen) UND fuer die Validierung beim Speichern. Announcement-Kanäle
// sind mit drin, weil dort ebenfalls gepostet werden kann (analog addChannelTypes bei /twitch).
export function holeTextKanaele(): KanalOption[] {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) {
        return [];
    }
    return guild.channels.cache
        .filter(kanal => kanal.type === ChannelType.GuildText || kanal.type === ChannelType.GuildAnnouncement)
        .map(kanal => ({id: kanal.id, name: kanal.name}))
        .sort((a, b) => sortierschluessel(a.name).localeCompare(sortierschluessel(b.name), 'de'));
}

// Serverseitige Validierung: nur eine ID aus der bekannten Kanalliste wird akzeptiert. Damit kann
// ueber das Formular kein beliebiger Wert (fremder Kanal, Unsinn) in Redis landen.
export function istGueltigerTextKanal(kanalId: string): boolean {
    return holeTextKanaele().some(kanal => kanal.id === kanalId);
}

// Datengetriebene Liste der ueber /config bearbeitbaren Kanal-Einstellungen. Jede traegt ihren
// Redis-Getter/-Setter - so kommt ein neues Kanal-Feld mit einer Zeile dazu, ohne neue Route/Handler.
// `schluessel` ist die Form-/Routen-Kennung (nur [a-z-], landet im hidden field "feld").
interface KanalService {
    label: string;
    lade: () => Promise<string | null>;
    speichere: (kanalId: string) => Promise<void>;
}

const KANAL_SERVICES: Record<string, KanalService> = {
    'protokoll': {
        label: 'Protokoll-Kanal',
        lade: () => loggingService.getLogChannel(),
        speichere: (id) => loggingService.setLogChannel(id),
    },
    'twitch-kanal': {
        label: 'Twitch-Benachrichtigungskanal',
        lade: () => twitchUserService.getNotificationChannel(),
        speichere: (id) => twitchUserService.setNotificationChannel(id),
    },
    'sport-kanal': {
        label: 'Sport-Ankündigungskanal',
        lade: () => sportService.getAnnouncementChannel(),
        speichere: (id) => sportService.setAnnouncementChannel(id),
    },
    'morgengruss-kanal': {
        label: 'Morgengruß-Kanal',
        lade: () => greetingService.getChannel(),
        speichere: (id) => greetingService.setChannel(id),
    },
};

export interface KanalFeld {
    schluessel: string;
    label: string;
    aktuelleId: string | null;
    status: FeldStatus;
}

export function istKanalFeld(schluessel: string): boolean {
    return Object.prototype.hasOwnProperty.call(KANAL_SERVICES, schluessel);
}

// Jedes Feld inkl. aktuell gesetzter Kanal-ID (rohe ID fuer die Vorauswahl im Dropdown) und
// Zustand. Der Abruf-Check (client.channels.fetch) faengt geloeschte Kanaele bzw. fehlenden Zugriff
// ab - ohne ihn wuerde das Dropdown eine tote ID einfach nicht wiederfinden und stillschweigend
// irgendetwas anderes anzeigen. Alle Felder parallel: sie haengen nicht voneinander ab.
export async function ladeKanalFelder(): Promise<KanalFeld[]> {
    return Promise.all(Object.entries(KANAL_SERVICES).map(async ([schluessel, service]) => {
        const aktuelleId = await service.lade();
        return {schluessel, label: service.label, aktuelleId, status: await kanalStatus(aktuelleId)};
    }));
}

async function kanalStatus(channelId: string | null): Promise<FeldStatus> {
    if (!channelId) {
        return 'leer';
    }
    const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
    return channel ? 'ok' : 'warnung';
}

export async function speichereKanal(schluessel: string, kanalId: string): Promise<void> {
    await KANAL_SERVICES[schluessel].speichere(kanalId);
}

export interface RollenOption {
    id: string;
    name: string;
}

// Alle Rollen des Servers ausser @everyone (id === guild.id) - fuers Rollen-Dropdown UND als
// Whitelist. Alphabetisch (Emoji-tolerant wie bei den Kanaelen), nicht nach Hierarchie - im
// Dropdown ist alphabetisch leichter zu finden.
export function holeRollen(): RollenOption[] {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) {
        return [];
    }
    return guild.roles.cache
        .filter(rolle => rolle.id !== guild.id)
        .map(rolle => ({id: rolle.id, name: rolle.name}))
        .sort((a, b) => sortierschluessel(a.name).localeCompare(sortierschluessel(b.name), 'de'));
}

export function istGueltigeRolle(rolleId: string): boolean {
    return holeRollen().some(rolle => rolle.id === rolleId);
}

export interface RollenFeld {
    aktuelleId: string | null;
    status: FeldStatus;
}

// Rohe ID (fuer die Vorauswahl im Dropdown) plus Zustand. Die Rolle ist optional, "nicht gesetzt"
// ist also kein Mangel - 'warnung' meint hier: gesetzt, aber die Rolle gibt es nicht mehr.
export async function holeTwitchRolle(): Promise<RollenFeld> {
    const aktuelleId = await twitchUserService.getNotificationRole();
    if (!aktuelleId) {
        return {aktuelleId: null, status: 'leer'};
    }
    const rolle = client.guilds.cache.get(config.GUILD_ID)?.roles.cache.get(aktuelleId);
    return {aktuelleId, status: rolle ? 'ok' : 'warnung'};
}

// null = Rolle entfernen (die Twitch-Benachrichtigungsrolle ist optional). Sonst setzen.
export async function speichereTwitchRolle(rolleId: string | null): Promise<void> {
    if (rolleId === null) {
        await twitchUserService.removeNotificationRole();
    } else {
        await twitchUserService.setNotificationRole(rolleId);
    }
}

export interface EventFelder {
    datum: string;   // YYYY-MM-DD (für <input type="date">) oder '' wenn kein Event gesetzt
    uhrzeit: string; // HH:MM (für <input type="time">) oder ''
    titel: string;
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

// Aktueller Event-Stand als Formularfelder (rohe Werte für die native date/time-Vorauswahl).
// Timestamp → lokale Datum/Zeit-Strings (Host läuft auf Europe/Berlin).
export async function holeEventFelder(): Promise<EventFelder> {
    const event = await eventService.getEvent();
    if (!event) {
        return {datum: '', uhrzeit: '', titel: ''};
    }
    const d = new Date(event.timestamp);
    return {
        datum: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        uhrzeit: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        titel: event.title ?? '',
    };
}

export async function speichereEventDaten(timestamp: number, titel: string | undefined): Promise<void> {
    await eventService.setEvent(timestamp, titel);
}

export async function entferneEvent(): Promise<void> {
    await eventService.clearEvent();
}

export interface MitgliedOption {
    id: string;
    name: string;
    // Aktueller Kilometerstand - wird im Dropdown mit angezeigt, damit ein Admin sieht, was er
    // überschreibt (setKilometer ist nicht rückgängig zu machen, siehe holeMitglieder).
    kilometer: number;
}

// Server-Mitglieder (ohne Bots), roh - ohne Redis-Zugriff. Dient als Whitelist beim Speichern;
// alle Mitglieder sind seit dem Start gecacht (loadAllMembers, GuildMembers-Intent).
// Alphabetisch nach Anzeigename (Emoji-tolerant).
function guildMitglieder(): {id: string; name: string}[] {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) {
        return [];
    }
    return guild.members.cache
        .filter(member => !member.user.bot)
        .map(member => ({id: member.id, name: member.displayName}))
        .sort((a, b) => sortierschluessel(a.name).localeCompare(sortierschluessel(b.name), 'de'));
}

// Dieselbe Liste fürs Dropdown, angereichert um den aktuellen Kilometerstand (ein Redis-Read für
// alle zusammen). Wer nichts eingetragen hat, steht mit 0 da.
export async function holeMitglieder(): Promise<MitgliedOption[]> {
    const kilometer = await sportService.getAlleKilometer();
    return guildMitglieder().map(member => ({...member, kilometer: kilometer[member.id] ?? 0}));
}

export function istGueltigesMitglied(userId: string): boolean {
    return guildMitglieder().some(member => member.id === userId);
}

// Die drei summen-ERHÖHENDEN Sport-Aktionen stoßen danach die Meilenstein-Prüfung an - genau wie
// die User-Aktionen im sport.handler. Vor der /config-Migration hing das an den (inzwischen
// entfernten) Admin-Commands; ohne den Aufruf hier bliebe eine überschrittene Schwelle liegen, bis
// zufällig jemand anders etwas einträgt. announceReachedMilestones fängt eigene Fehler ab und darf
// das Speichern deshalb nicht nachträglich scheitern lassen.
export async function speichereKilometer(userId: string, kilometer: number): Promise<void> {
    await sportService.setKilometer(userId, kilometer);
    await sportHandler.announceReachedMilestones();
}

export async function holeLegacyKilometer(): Promise<number> {
    return sportService.getLegacyKilometer();
}

export async function addiereLegacyKilometer(kilometer: number): Promise<void> {
    await sportService.addLegacyKilometer(kilometer);
    await sportHandler.announceReachedMilestones();
}

// 0 entfernt die Bestandskilometer ganz (siehe sportService.setLegacyKilometer). Die
// Meilenstein-Prüfung läuft auch hier: Setzen kann die Summe erhöhen. Verkleinert sie sich, kann
// checkAndMarkReachedMilestones nichts auslösen (es meldet nur erreichte, noch nicht angekündigte).
export async function setzeLegacyKilometer(kilometer: number): Promise<void> {
    await sportService.setLegacyKilometer(kilometer);
    await sportHandler.announceReachedMilestones();
}

export async function holeMeilensteine(): Promise<SportMilestone[]> {
    return sportService.getMilestones();
}

// Wie ein persönliches Morgengruß-Emoji dargestellt wird. Bewusst eine unterschiedene Union statt
// eines fertigen HTML-Schnipsels: das Sammeln bleibt hier (testbar mit Mocks), das Rendern im Router.
// - 'unicode'   : direkt darstellbares Zeichen (👋, ☀️ …)
// - 'custom'    : Server-Emoji; im Hash liegt nur die ID, im Browser braucht es ein <img> (Discord-
//                 Markup wie <:name:id> rendert NUR in Discord, nicht auf einer Webseite)
// - 'unbekannt' : gespeicherte ID, die es auf dem Server nicht mehr gibt (Emoji gelöscht)
export type MorgengrussEmoji =
    | {art: 'unicode'; zeichen: string}
    | {art: 'custom'; url: string; name: string}
    | {art: 'unbekannt'; id: string};

export interface MorgengrussEintrag {
    id: string;
    name: string;
    // true = aus der Chat-Historie gelernt, false = per ableiteEmoji aus der User-ID abgeleitet.
    // Ohne diese Unterscheidung sähe der Fallback wie eine echte Zuordnung aus.
    gelernt: boolean;
    emoji: MorgengrussEmoji;
}

// Custom-Emojis liegen als blanke Snowflake-ID im Hash (siehe werteReaktionenAus: `emoji.id ?? name`),
// Unicode-Emojis als Zeichen. Nur Ziffern = ID, sonst Zeichen.
function deuteEmoji(gespeichert: string): MorgengrussEmoji {
    if (!/^\d+$/.test(gespeichert)) {
        return {art: 'unicode', zeichen: gespeichert};
    }
    const emoji = client.guilds.cache.get(config.GUILD_ID)?.emojis.cache.get(gespeichert);
    return emoji
        ? {art: 'custom', url: emoji.imageURL(), name: emoji.name ?? gespeichert}
        : {art: 'unbekannt', id: gespeichert};
}

// Übersicht Person → persönliches Morgengruß-Emoji für /config. Listet ALLE Mitglieder, nicht nur die
// gelernten: wer nichts Gelerntes hat, wird beim Gruß per ableiteEmoji bedient, und ohne diese Zeilen
// fehlte die halbe Belegschaft in der Übersicht. Ein Redis-Read für alle zusammen.
export async function holeMorgengrussEmojis(): Promise<MorgengrussEintrag[]> {
    const gelernt = await greetingService.getLearnedEmojis().catch(() => ({} as Record<string, string>));
    return guildMitglieder().map(mitglied => {
        const gespeichert = gelernt[mitglied.id];
        return {
            ...mitglied,
            gelernt: gespeichert !== undefined,
            emoji: gespeichert !== undefined
                ? deuteEmoji(gespeichert)
                : {art: 'unicode' as const, zeichen: ableiteEmoji(mitglied.id)},
        };
    });
}

export async function entferneMeilenstein(kilometer: number): Promise<void> {
    await sportService.removeMilestone(kilometer);
}
