import {Collection, Events, GuildMember, Snowflake} from "discord.js";
import client from "../client.js";
import userService from "../services/user.service.js";

client.on(Events.GuildMemberAdd, (member) => {
    console.log(`${member.user.tag} ist dem Server beigetreten.`);
});

client.on(Events.GuildMemberRemove, (member) => {
    console.log(`${member.user.tag} hat den Server verlassen.`);
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    console.log(`${newMember.user.tag} wurde aktualisiert.`);
});

client.on(Events.UserUpdate, (oldUser, newUser) => {
    console.log(`${oldUser.username} -> ${newUser.username}`);
});

export async function loadAllMembers(): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
        const collection: Collection<Snowflake, GuildMember> = await guild.members.fetch();
        console.log(`Loaded members for ${guild.name}: ${collection.size}`);
        collection.forEach((user) => {
            userService.saveUser(user);
        });
    }
}
