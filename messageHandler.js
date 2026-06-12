import pjson from "./package.json" with {type: "json"};

export async function handleMessage(message) {
    console.log(
        `Nachricht von ${message.author.tag}: ${message.content}`
    );

    // Ignore bots
    if (message.author.bot) return;

    switch (message.content) {
        case "!ping":
            await message.reply("Pong!");
            break;

        case "!version":
            await message.reply(
                `Aktuelle Version: ${pjson.version}`
            );
            break;
    }
}