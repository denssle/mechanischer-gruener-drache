import redisService from './redis.service.js';

// Gelegentliche Tipps + kleine Nettigkeiten, die an eine ohnehin ausgelöste Bot-Antwort
// gehängt werden (ephemer, siehe interaction.handler.ts) - damit Leute Befehle entdecken,
// ohne dass jemand /hilfe aufrufen muss. Bewusst stark gedrosselt: der Bot soll niemanden
// belehren und im Channel gar nicht erst zusätzlich auffallen.
const CHANCE = 0.15;              // nur ~jede 7. Interaktion trägt überhaupt eine Zeile
const COOLDOWN_SECONDS = 86400;   // und pro Person höchstens eine am Tag
const NETTIGKEIT_CHANCE = 0.3;    // davon ist rund jede dritte Zeile ein Tipp-freier Gruß

const KEYS = {
    cooldown: (userId: string) => `TIPP:COOLDOWN:${userId}`,
};

// Bei /hilfe und /spielwelt weiß die Person gerade selbst, wo die Befehle stehen -
// ein Tipp wäre dort nur redundant.
const AUSGENOMMENE_COMMANDS = ['hilfe', 'spielwelt'];

export const TIPPS = [
    'Tipp: Mit `/charakter verknuepfen` hinterlegst du deinen LotGD-Charakter – danach wird dein Name in `/online` und `/ereignisse` hervorgehoben.',
    'Tipp: `/online` zeigt dir, wer gerade im Spiel eingeloggt ist.',
    'Tipp: `/ereignisse` zeigt, was zuletzt im Spiel passiert ist – wer wen erschlagen oder wiederbelebt hat.',
    'Tipp: `/news` holt dir die neuesten Ankündigungen direkt von lotgd.de.',
    'Tipp: Mit `/sport eintragen` zahlst du deine Kilometer auf die gemeinsame Gesamtstrecke ein – es gibt bewusst keine Rangliste.',
    'Tipp: `/sport gesamt` zeigt, wie weit der Server zusammen schon gekommen ist.',
    'Tipp: Mit `/sport meilenstein setzen` legst du ein Ziel fest – der Bot feiert es, sobald wir es gemeinsam erreichen.',
    'Tipp: `/pingpong herausfordern` fordert jemanden zum Duell – Sieg bringt einen Punkt, Niederlage kostet einen.',
    'Tipp: `/event countdown` verrät dir, wie lange es noch bis zum nächsten Treffen dauert.',
    'Tipp: Mit `/twitch verknuepfen` sagt der Server Bescheid, wenn du live gehst.',
    'Tipp: `/blahaj` rechnet dir Euro-Beträge in Blåhajs um.',
    'Tipp: `/hilfe` zeigt dir alle Befehle auf einen Blick.',
    'Tipp: `/spielwelt` erklärt die Befehle rund um lotgd.de.',
];

export const NETTIGKEITEN = [
    'Schön, dass du da bist.',
    'Ich hoffe, du hast einen guten Tag.',
    'Denk dran, zwischendurch mal etwas zu trinken.',
    'Falls es heute anstrengend war: Du hast es bis hierher geschafft.',
    'Grüße aus dem Maschinenraum.',
    'Kleine Erinnerung: Du machst das gut.',
    'Ich freue mich jedes Mal, wenn hier jemand vorbeischaut.',
    'Streck dich mal kurz. Ja, wirklich, jetzt.',
];

export function randomTipp(): string {
    return TIPPS[Math.floor(Math.random() * TIPPS.length)];
}

export function randomNettigkeit(): string {
    return NETTIGKEITEN[Math.floor(Math.random() * NETTIGKEITEN.length)];
}

// Entscheidet allein anhand des Kontexts, ob eine Zeile überhaupt in Frage kommt -
// bewusst ohne Redis/Zufall, damit die Regeln testbar und offensichtlich bleiben.
// Ephemere Antworten sind genau die Fehlermeldungen, Cooldown-Abfuhren und
// Admin-Quittungen: da löst gerade jemand ein Problem und will kein Tutorial.
export function kommtTippInFrage(commandName: string, warEphemer: boolean): boolean {
    if (warEphemer) return false;
    return !AUSGENOMMENE_COMMANDS.includes(commandName);
}

class TippService {
    // Liefert eine Zeile - oder null, wenn diesmal (bewusst) keine kommt: entweder weil der
    // Würfel dagegen war oder weil die Person heute schon eine bekommen hat.
    async holeZeileFuerUser(userId: string): Promise<string | null> {
        if (Math.random() >= CHANCE) {
            return null;
        }

        const verbleibend = await redisService.getTimeToLive(KEYS.cooldown(userId));
        if (verbleibend > 0) {
            return null;
        }

        await redisService.setWithExpiry(KEYS.cooldown(userId), '1', COOLDOWN_SECONDS);

        return Math.random() < NETTIGKEIT_CHANCE ? randomNettigkeit() : randomTipp();
    }
}

export default new TippService();
