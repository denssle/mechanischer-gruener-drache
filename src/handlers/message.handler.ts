import {Message, OmitPartialGroupDMChannel} from "discord.js";

class MessageHandler {

    async messageCreate(message: OmitPartialGroupDMChannel<Message<boolean>>) {
        console.log(`Nachricht von ${message.author.tag}: ${message.content}`);

        // Ignore bots
        // if (message.author.bot) return;
    }
}

export default new MessageHandler();