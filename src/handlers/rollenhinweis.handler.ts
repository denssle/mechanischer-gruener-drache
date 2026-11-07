import {Message, OmitPartialGroupDMChannel} from 'discord.js';
import rollenhinweisService from '../services/rollenhinweis.service.js';

// Bewusst eine normale, bleibende Antwort: ephemere ("nur du siehst das") Nachrichten gibt es in
// Discord nur als Antwort auf Interactions (Slash-Command, Button, ...), nicht auf Chatnachrichten.
// Eine DM wäre privat gewesen, wurde aber bewusst nicht gewählt (User-Entscheidung 2026-10-22).
export const ROLLENHINWEIS_TEXT =
    'Hallo und willkommen! Du hast bisher noch keine Rolle auf dem Server - deshalb siehst du ' +
    'nur einen kleinen Teil davon. Hol dir eine Rolle, dann kannst du überall mitlesen und mitmachen.';

class RollenhinweisHandler {
    // Auto-Listener für den Rollenhinweis-Kanal: wer dort ohne jede Rolle schreibt, bekommt EINMAL
    // (pro Person, für immer) eine Antwort mit dem Hinweis. Kanal kommt aus /config, ohne Kanal
    // passiert nichts.
    async handleMessage(message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<void> {
        if (message.author.bot || message.system || !message.guild || !message.member) return;

        const channelId = await rollenhinweisService.getChannel();
        if (!channelId || message.channelId !== channelId) return;

        // @everyone steckt in jedem Rollen-Cache (ID = Guild-ID) und zählt nicht als Rolle.
        const guildId = message.guild.id;
        if (message.member.roles.cache.some(rolle => rolle.id !== guildId)) return;

        if (!await rollenhinweisService.markiereHingewiesen(message.author.id)) return;

        try {
            await message.reply(ROLLENHINWEIS_TEXT);
        } catch (error) {
            await rollenhinweisService.vergiss(message.author.id);
            throw error;
        }
    }
}

export default new RollenhinweisHandler();
