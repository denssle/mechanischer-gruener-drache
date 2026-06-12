import pjson from "./package.json" with {type: "json"};
import {get, set} from "./redis.js";

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
        const newVar = await updateScore(message.author.id, score++);
        return message.reply("Du hast einen Punkt gemacht! Du hast aktuell " + newVar + " Punkte!");
    }
    return message.reply("Das war leider nichts! Du bleibst bei " + score + " Punkten!");
}

async function getScore(userId) {
    let score = await get(generatePingPongKey(userId));
    console.log("Retrieved score for user", userId, "to", score);

    if (!score) {
        return await updateScore(userId, 0);
    }
    return convertScoreToNumber(score);
}

async function updateScore(userId, score) {
    console.log("Updating score for user", userId, "to", score);

    return convertScoreToNumber(await set(generatePingPongKey(userId), score));
}

function convertScoreToNumber(score) {
    console.log("Converting score to number:", score);

    if (!score || isNaN(score)) {
        return 0;
    }
    return Number(score);
}

function generatePingPongKey(userId) {
    return userId + "PING_PONG";
}