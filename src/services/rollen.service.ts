import {GuildMember} from 'discord.js';

// @everyone steckt in jedem Rollen-Cache (ID = Guild-ID) und zählt nicht als Rolle. Geteilt, damit
// /diagnose und der Rollenhinweis nie verschieden entscheiden, wer als "ohne Rolle" gilt.
export function hatEigeneRolle(mitglied: Pick<GuildMember, 'roles'>, guildId: string): boolean {
    return mitglied.roles.cache.some(rolle => rolle.id !== guildId);
}
