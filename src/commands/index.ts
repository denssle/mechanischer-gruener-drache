import ping from "./ping.command.js";
import version from "./version.command.js";
import sport from "./sport.command.js";
import twitch from "./twitch.command.js";
import rollenbutton from "./rollenbutton.command.js";
import event from "./event.command.js";
import news from "./news.command.js";
import ereignisse from "./ereignisse.command.js";
import online from "./online.command.js";
import spielwelt from "./spielwelt.command.js";
import charakter from "./character.command.js";
import hilfe from "./hilfe.command.js";
import blahaj from "./blahaj.command.js";
import diagnose from "./diagnose.command.js";
import rollenspiel from "./rollenspiel.command.js";
import anstupser from "./anstupser.command.js";
import geburtstag from "./geburtstag.command.js";
import beobachten from "./beobachten.command.js";

// Reine Admin-Werkzeuge: stehen bewusst weder in /hilfe noch in den Tipps - wer sie braucht,
// weiß von ihnen. Die Liste steht hier statt in den Tests, weil sie eine Aussage über die
// Befehle ist und nicht über deren Prüfung: hilfe.handler.test.ts und tipp.service.test.ts
// leiten ihre Erwartungen daraus ab, und beide müssen dieselbe Ausnahme kennen.
// Sie lässt sich (noch) nicht aus den Command-Definitionen ableiten - die Admin-Prüfung sitzt
// im jeweiligen Handler (`interaction.memberPermissions`), nicht als
// setDefaultMemberPermissions am SlashCommandBuilder.
export const NUR_ADMIN_BEFEHLE = ['diagnose', 'rollenbutton'];

export default [
    ping,
    version,
    sport,
    twitch,
    rollenbutton,
    event,
    news,
    ereignisse,
    online,
    spielwelt,
    charakter,
    hilfe,
    blahaj,
    diagnose,
    rollenspiel,
    anstupser,
    geburtstag,
    beobachten
];