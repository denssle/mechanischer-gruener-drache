import pjson from "./package.json" with {type: "json"};
import {get, set} from "./redis";

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
            return handlePing(message);
        case "!version":
            return message.reply(`Aktuelle Version: ${pjson.version}`);
    }
}

async function handlePing(message) {
    let score = await getScore(message.author.id);
    if (Date.now() % 2 === 0) {
        return message.reply("Du hast einen Punkt gemacht! Du hast aktuell " + await updateScore(message.author.id, score + 1) + " Punkte!");
    }
    return message.reply("Das war leider nichts! Du bleibst bei " + score + " Punkten!");
}

async function getScore(userId) {
    let score = await get(generatePingPongKey(userId));
    if (score === null) {
        return await updateScore(userId, 0)
    }
    return Number(score);
}

async function updateScore(userId, score) {
    return await set(generatePingPongKey(userId), score);
}

function generatePingPongKey(userId) {
    return userId + "PING_PONG";
}