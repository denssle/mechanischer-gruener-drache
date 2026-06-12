import {get, getSortedSet, set, setSortedSet} from "../redis.js";

const PING_PONG_KEY = "PING_PONG";


export async function handlePingPong(message) {
    let score = await getScore(message.author.id);
    if (Date.now() % 2 === 0) {
        const newVar = await updateScore(message.author.id, score + 1);
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
    const newScore = convertScoreToNumber(await set(generatePingPongKey(userId), score))
    setHighscore(userId, newScore);
    return newScore;
}

function convertScoreToNumber(score) {
    console.log("Converting score to number:", score);

    if (!score || isNaN(score)) {
        return 0;
    }
    return Number(score);
}


function generatePingPongKey(userId) {
    return userId + PING_PONG_KEY;
}

function setHighscore(userId, newScore) {
    console.log("Setting highscore for user", userId, "to", newScore);
    setSortedSet(PING_PONG_KEY, userId, newScore)
}

export async function handlePingPongHighscore(message) {
    const highscore = await getSortedSet(PING_PONG_KEY);
    console.log("Retrieved highscore for user", message.author.tag, "to", highscore)
    return message.reply("Highscore: " + highscore);
}
