import {ChatInputCommandInteraction, Collection, Events, Interaction, MessageFlags} from "discord.js";
import client from "../client.js";
import { Command } from "../types/discord.js";
import buttonRoleHandler from "./buttonRole.handler.js";
import pingPongHandler from "./pingPong.handler.js";
import tippService, {kommtTippInFrage} from "../services/tipp.service.js";

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

// Exportiert (statt inline im client.on-Callback), damit die Dispatch-Logik testbar ist -
// der zentrale Verteiler für alle Interactions soll nicht die einzige ungetestete Stelle sein.
export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
    // Alle Button-Handler prüfen anhand des customId-Prefix selbst, ob sie zuständig sind.
    if (interaction.isButton()) {
        await buttonRoleHandler.handleButton(interaction);
        await pingPongHandler.handleDuellButton(interaction);
        await pingPongHandler.handleTaktikButton(interaction);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
        await zeigeGelegentlichEinenTipp(interaction);
    } catch (error) {
        console.error("command execution error", error);
    }
}

// Async void-Callback: braucht .catch, sonst killt eine unhandled rejection den Prozess (siehe
// CLAUDE.md) - z.B. wenn ein Button-Handler wirft, der Command-Pfad fängt selbst.
client.on(Events.InteractionCreate, (interaction: Interaction) => {
    handleInteractionCreate(interaction).catch((error) => {
        console.error('Fehler im Interaction-Handler:', error);
    });
});

// Hängt selten (siehe tipp.service) eine Tipp- oder Nettigkeits-Zeile an eine ohnehin
// ausgelöste Antwort - als ephemeres followUp, damit im Channel keine zusätzliche
// Nachricht für alle anderen entsteht. Bewusst fehlertolerant: ein Tipp darf einen
// erfolgreich ausgeführten Befehl niemals nachträglich scheitern lassen.
export async function zeigeGelegentlichEinenTipp(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        // Vor allen Abbruchbedingungen, damit jede Ausführung zählt (auch ephemere und
        // /hilfe): Der Set der benutzten Befehle entscheidet, welche Tipps noch in Frage
        // kommen - eine Lücke hier hieße, dass jemand Tipps zu Befehlen bekommt, die er
        // längst kennt.
        await tippService.merkeBenutztenBefehl(interaction.user.id, interaction.commandName);

        if (!interaction.replied && !interaction.deferred) return;
        if (!kommtTippInFrage(interaction.commandName, interaction.ephemeral === true)) return;

        const zeile = await tippService.holeZeileFuerUser(interaction.user.id);
        if (!zeile) return;

        await interaction.followUp({content: zeile, flags: MessageFlags.Ephemeral});
    } catch (error) {
        console.error("Fehler beim Anhängen eines Tipps:", error);
    }
}
