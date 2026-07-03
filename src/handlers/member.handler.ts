import {Collection, Events, GuildMember, Snowflake} from "discord.js";
import client from "../client.js";
import userService from "../services/user.service.js";

client.on(Events.GuildMemberAdd, (member) => {
    console.log(`${member.user.tag} ist dem Server beigetreten.`);
});

client.on(Events.GuildMemberRemove, (member) => {
    console.log(`${member.user.tag} hat den Server verlassen.`);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
        await userService.saveUser(newMember);
    } catch (error) {
        console.error("Error saving user on update:", error);
    }
});

client.on(Events.UserUpdate, async (oldUser, newUser) => {
    try {
        const member = await client.guilds.cache
            .first()
            ?.members.fetch(newUser.id);
        if (member) await userService.saveUser(member);
    } catch (error) {
        console.error("Error saving user on user update:", error);
    }
});

export async function loadAllMembers(): Promise<void> {
    try {
        for (const guild of client.guilds.cache.values()) {
            const collection: Collection<Snowflake, GuildMember> = await guild.members.fetch();
            console.log(`Loaded members for ${guild.name}: ${collection.size}`);
            for (const user of collection.values()) {
                await userService.saveUser(user);
            }
        }
    } catch (error) {
        console.error("Error loading all members:", error);
    }
}
