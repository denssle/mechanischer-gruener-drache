import {Events, Interaction} from "discord.js";
import client from "../client.js";
import '../types/discord.js';

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
