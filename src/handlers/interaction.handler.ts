import {Events, Interaction, Collection} from "discord.js";
import client from "../client.js";
import { Command } from "../types/discord.js";
import buttonRoleHandler from "./buttonRole.handler.js";
import pingPongHandler from "./pingPong.handler.js";

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // Beide Button-Handler prüfen anhand des customId-Prefix selbst, ob sie zuständig sind.
    if (interaction.isButton()) {
        await buttonRoleHandler.handleButton(interaction);
        await pingPongHandler.handleDuellButton(interaction);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error("command execution error", error);
    }
});
