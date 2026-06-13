import redisService from "./redis.service.js";
import {GuildMember} from "discord.js";

class UserService {
    saveUser(user: GuildMember) {
        console.log(user);
    }
}

export default new UserService();