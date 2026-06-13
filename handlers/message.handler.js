
class MessageHandler {

    async messageCreate(message) {
        console.log(`Nachricht von ${message.author.tag}: ${message.content}`);

        // Ignore bots
        // if (message.author.bot) return;
    }
}

export default new MessageHandler();