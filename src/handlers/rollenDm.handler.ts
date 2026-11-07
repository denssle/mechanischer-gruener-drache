import {Guild, GuildMember, Role} from 'discord.js';
import client from '../client.js';
import rollenDmService from '../services/rollenDm.service.js';
import rollenhinweisService from '../services/rollenhinweis.service.js';
import {sendeDm} from '../services/dm.service.js';
import config from '../../config.json' with {type: 'json'};

// Einmalige Erinnerung per DM an alle, denen die Hauptrolle fehlt. Das ist die einzige Ausnahme von
// der Linie "der Bot schreibt niemanden ungefragt an" (siehe docs/features/anstupser.md). Deshalb
// startet sie NUR von Hand über /config, erreicht jede Person höchstens einmal im Leben und lässt
// sich jederzeit abbrechen.

const TAG_MS = 24 * 60 * 60 * 1000;
// Wer frisch da ist, hat gerade den Willkommensgruß bekommen.
const SCHONFRIST_TAGE = 30;

// Eine DM alle 10 Minuten zwischen 17 und 20 Uhr (lokale Host-Zeit = Europe/Berlin), also höchstens
// 18 am Tag. Viele DMs an Fremde auf einmal sehen für Discord nach Spam aus, und abends werden sie
// eher gelesen. Der Timer braucht dafür keinen Zähler: eine doppelte Minute träfe bloß die nächste Person.
const ERSTE_STUNDE = 17;
const ENDE_STUNDE = 20;
const ABSTAND_MINUTEN = 10;

export function istVersandZeit(datum: Date): boolean {
    const stunde = datum.getHours();
    return stunde >= ERSTE_STUNDE && stunde < ENDE_STUNDE && datum.getMinutes() % ABSTAND_MINUTEN === 0;
}

// Voller Link statt <#id>: Kanal-Erwähnungen sind in DMs nicht verlässlich klickbar.
export function rollenDmText(serverName: string, rollenName: string, link: string): string {
    return `Hallo! Du bist auf dem Server „${serverName}", siehst dort aber nur einen kleinen Teil, ` +
        `weil dir die Rolle „${rollenName}" fehlt. Mit einem Klick holst du sie dir hier: ${link}\n\n` +
        'Das ist eine einmalige Erinnerung, ich schreibe dich deswegen nicht noch einmal an.';
}

export function waehleEmpfaenger(
    mitglieder: Iterable<GuildMember>,
    hauptrolleId: string,
    angeschrieben: Set<string>,
    jetzt = Date.now(),
): string[] {
    const empfaenger: string[] = [];
    for (const mitglied of mitglieder) {
        if (mitglied.user.bot || mitglied.roles.cache.has(hauptrolleId) || angeschrieben.has(mitglied.id)) continue;
        if (jetzt - (mitglied.joinedTimestamp ?? 0) < SCHONFRIST_TAGE * TAG_MS) continue;
        empfaenger.push(mitglied.id);
    }
    return empfaenger;
}

interface Voraussetzungen {
    guild: Guild;
    hauptrolle: Role;
    text: string;
}

export interface RollenDmStand {
    // null = Hauptrolle oder Rollen-Kanal fehlen, die Runde kann nicht starten.
    text: string | null;
    wuerdenAngeschrieben: number;
    ausstehend: number;
    angeschrieben: number;
    nichtZugestellt: number;
}

class RollenDmHandler {
    private async ladeVoraussetzungen(): Promise<Voraussetzungen | null> {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        const [hauptrolleId, rollenKanalId] = await Promise.all([
            rollenhinweisService.getHauptrolle(),
            rollenhinweisService.getRollenKanal(),
        ]);
        const hauptrolle = hauptrolleId ? guild?.roles.cache.get(hauptrolleId) : undefined;
        if (!guild || !hauptrolle || !rollenKanalId) return null;

        const link = `https://discord.com/channels/${guild.id}/${rollenKanalId}`;
        return {guild, hauptrolle, text: rollenDmText(guild.name, hauptrolle.name, link)};
    }

    // Für /config. Die Vorschau nimmt den Mitglieder-Cache: die Seite soll beim Laden nicht bei
    // Discord nachfragen, und starte() holt die Liste ohnehin frisch.
    async holeStand(): Promise<RollenDmStand> {
        const [voraussetzungen, warteschlange, angeschrieben, nichtZugestellt] = await Promise.all([
            this.ladeVoraussetzungen(),
            rollenDmService.getWarteschlange(),
            rollenDmService.getAngeschrieben(),
            rollenDmService.getNichtZugestellt(),
        ]);
        const wuerdenAngeschrieben = voraussetzungen
            ? waehleEmpfaenger(voraussetzungen.guild.members.cache.values(), voraussetzungen.hauptrolle.id, new Set(angeschrieben)).length
            : 0;
        return {
            text: voraussetzungen?.text ?? null,
            wuerdenAngeschrieben,
            ausstehend: warteschlange.length,
            angeschrieben: angeschrieben.length,
            nichtZugestellt: nichtZugestellt.length,
        };
    }

    // false = Hauptrolle oder Rollen-Kanal fehlen. Hier geht noch nichts raus, nur die Warteschlange füllt sich.
    async starte(): Promise<boolean> {
        const voraussetzungen = await this.ladeVoraussetzungen();
        if (!voraussetzungen) return false;

        const mitglieder = await voraussetzungen.guild.members.fetch();
        const angeschrieben = new Set(await rollenDmService.getAngeschrieben());
        const empfaenger = waehleEmpfaenger(mitglieder.values(), voraussetzungen.hauptrolle.id, angeschrieben);
        await Promise.all(empfaenger.map(id => rollenDmService.inWarteschlange(id)));
        console.log(`Rollen-DM-Runde gestartet: ${empfaenger.length} Empfänger in der Warteschlange.`);
        return true;
    }

    async brichAb(): Promise<void> {
        await rollenDmService.leereWarteschlange();
        console.log('Rollen-DM-Runde abgebrochen.');
    }

    // Wird vom 60-s-Timer in index.ts angestupst. Ohne gestartete Runde ist die Warteschlange leer und
    // es passiert nichts. Vor dem Senden wird neu geprüft: wer inzwischen die Rolle hat oder weg ist,
    // fällt raus, und dann ist gleich die nächste Person dran.
    async sendeNaechste(): Promise<void> {
        if (!istVersandZeit(new Date())) return;

        const warteschlange = await rollenDmService.getWarteschlange();
        if (!warteschlange.length) return;

        const voraussetzungen = await this.ladeVoraussetzungen();
        if (!voraussetzungen) {
            console.warn('Rollen-DM-Runde pausiert: Hauptrolle oder Rollen-Kanal fehlen.');
            return;
        }

        for (const userId of warteschlange) {
            await rollenDmService.ausWarteschlange(userId);

            const mitglied = await voraussetzungen.guild.members.fetch(userId).catch(() => null);
            if (!mitglied || mitglied.roles.cache.has(voraussetzungen.hauptrolle.id)) continue;

            // Vermerk VOR dem Versand: stürzt der Bot dazwischen ab, fehlt schlimmstenfalls eine DM.
            // Zwei DMs an dieselbe Person wären der schlimmere Fehler.
            if (!await rollenDmService.markiereAngeschrieben(userId)) continue;

            if (!await sendeDm(userId, voraussetzungen.text, 'Rollen-Erinnerung')) {
                await rollenDmService.markiereNichtZugestellt(userId);
            }
            return;
        }
    }
}

export default new RollenDmHandler();
