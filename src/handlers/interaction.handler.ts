import {Events, Interaction, Collection} from "discord.js";
import client from "../client.js";
import { Command } from "../types/discord.js";

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error("command execution error", error);
    }
});
