import {Collection, Events, GuildMember, PartialGuildMember, PartialUser, Snowflake, User} from "discord.js";
import client from "../client.js";
import userService from "../services/user.service.js";
import config from "../../config.json" with {type: "json"};

class MemberHandler {
    handleGuildMemberAdd(member: GuildMember) {
        console.log(`${member.user.tag} ist dem Server beigetreten.`);
    }

    handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
        console.log(`${member.user.tag} hat den Server verlassen.`);
    }

    async handleGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        try {
            await userService.saveUser(newMember);
        } catch (error) {
            console.error("Error saving user on update:", error);
        }
    }

    async handleUserUpdate(oldUser: User | PartialUser, newUser: User) {
        try {
            const member = await client.guilds.cache
                .get(config.GUILD_ID)
                ?.members.fetch(newUser.id);
            if (member) await userService.saveUser(member);
        } catch (error) {
            console.error("Error saving user on user update:", error);
        }
    }

    async loadAllMembers(): Promise<void> {
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
}

const memberHandler = new MemberHandler();

client.on(Events.GuildMemberAdd, memberHandler.handleGuildMemberAdd);
client.on(Events.GuildMemberRemove, memberHandler.handleGuildMemberRemove);
// Die beiden oberen sind synchron, ein Promise gibt es dort nicht. Die async-Handler bekommen ihr
// .catch an der Registrierung, auch wenn sie intern fangen (siehe CLAUDE.md, Stolperfallen).
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    memberHandler.handleGuildMemberUpdate(oldMember, newMember).catch((error) => {
        console.error('Fehler im Member-Handler (GuildMemberUpdate):', error);
    });
});
client.on(Events.UserUpdate, (oldUser, newUser) => {
    memberHandler.handleUserUpdate(oldUser, newUser).catch((error) => {
        console.error('Fehler im Member-Handler (UserUpdate):', error);
    });
});

export default memberHandler;
