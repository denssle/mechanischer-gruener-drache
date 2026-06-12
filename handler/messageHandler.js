import pjson from "../package.json" with {type: "json"};
import {handlePingPong, handlePingPongHighscore} from "./pingPongHandler.js";

export async function handleMessage(message) {
    console.log(
        `Nachricht von ${message.author.tag}: ${message.content}`
    );

    // Ignore bots
    if (message.author.bot) return;

    handleCommand(message);
}

function handleCommand(message) {
    switch (message.content) {
        case "!ping":
            return handlePingPong(message);
        case "!pingHighscore":
            return handlePingPongHighscore(message);
        case "!version":
            return message.reply(`Aktuelle Version: ${pjson.version}`);
    }
}