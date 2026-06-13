import redisService from "./redis.service.js";

class UserService {
    saveUser(user) {
        console.log(user);
    }
}

export default new UserService();