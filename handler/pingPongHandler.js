import {get, getSortedSet, set, setSortedSet} from "../redis.js";

const PING_PONG_KEY = "PING_PONG";


export async function handlePingPong(message) {
    let score = await getScore(message);
    if (Date.now() % 2 === 0) {
        const newVar = await updateScore(message.author.id, score + 1);
        return message.reply("Du hast einen Punkt gemacht! Du hast aktuell " + newVar + " Punkte!");
    }
    return message.reply("Das war leider nichts! Du bleibst bei " + score + " Punkten!");
}

async function getScore(message) {
    let score = await get(generatePingPongKey(message.author.id));
    console.log("Retrieved score for user", message.author.id, "to", score);

    if (!score) {
        return await updateScore(message.author.id, 0, message.author.tag);
    }
    return convertScoreToNumber(score);
}

async function updateScore(userId, score, usertag) {
    console.log("Updating score for user", userId, "to", score);
    const newScore = convertScoreToNumber(await set(generatePingPongKey(userId), score))
    setHighscore(usertag, newScore);
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

function setHighscore(usertag, newScore) {
    console.log("Setting highscore for user", usertag, "to", newScore);
    setSortedSet(PING_PONG_KEY, usertag, newScore)
}

export async function handlePingPongHighscore(message) {
    const highscore = await getSortedSet(PING_PONG_KEY);
    console.log("Retrieved highscore for user", message.author.tag, "to", highscore)
    return message.reply("Highscore: " + highscore
        .sort((a, b) => b.score - a.score)
        .map((item, index) => `- ${index + 1}. ${item.value} - ${item.score}`)
        .join('\n'));
}
