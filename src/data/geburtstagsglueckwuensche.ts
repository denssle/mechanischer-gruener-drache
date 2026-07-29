// Reine Daten - die Auswahl-Logik steckt in handlers/geburtstag.handler.ts (waehleGlueckwunsch).
// Zweites Verzeichnis-Mitglied neben tipps/nettigkeiten, aus demselben Grund: die Listen sind lang
// genug, dass sie inline die eigentliche Logik des Handlers begraben würden.
//
// Ton wie bei den Nettigkeiten: herzlich, ohne Kitsch, ohne Aufgaben ("feier schön, aber trink
// genug"). Emojifrei wie alle Bot-Antworten - der Glückwunsch trägt sich selbst.
//
// {name} wird durch die Erwähnung der Person ersetzt (der Glückwunsch DARF pingen, das ist sein Sinn).
export const GEBURTSTAGS_GLUECKWUENSCHE = [
    // Schlicht und herzlich
    'Alles Gute zum Geburtstag, {name}!',
    'Herzlichen Glückwunsch, {name}!',
    '{name} hat heute Geburtstag – alles Gute!',
    'Einen schönen Geburtstag, {name}.',
    'Auf {name}: alles Gute zum Geburtstag!',
    'Herzlichen Glückwunsch zum Geburtstag, {name}. Schön, dass es dich gibt.',
    'Alles Gute, {name} – lass dich heute ordentlich feiern.',
    'Ein Hoch auf {name}, heute ist Geburtstag.',
    'Glückwunsch, {name}! Heute ist dein Tag.',
    '{name} wird heute gefeiert. Alles Gute!',

    // Etwas verspielter
    'Die Zahnräder haben es sich gemerkt: {name} hat heute Geburtstag. Alles Gute!',
    'Ich habe extra Dampf abgelassen, um es rechtzeitig zu sagen: Alles Gute, {name}!',
    'Ein mechanischer Drache wünscht {name} einen wunderbaren Geburtstag.',
    'Kurz das Feuer angefacht, um zu gratulieren: Herzlichen Glückwunsch, {name}!',
    'Heute klingelt es im Kalender, und zwar für {name}. Alles Gute!',
    'Etwas Konfetti aus Messingspänen für {name} – alles Gute zum Geburtstag!',
    'Der Kalender sagt: {name} hat Geburtstag. Der Drache sagt: herzlichen Glückwunsch!',

    // Mit LotGD-Anklang
    '{name} hat Geburtstag – möge der Wald heute besonders gnädig sein.',
    'Alles Gute, {name}! Auf ein Jahr voller gewonnener Waldkämpfe.',
    'Herzlichen Glückwunsch, {name}. Selbst Ramius macht heute mal Pause.',
    'Ein Fest für {name}: alles Gute zum Geburtstag, und mögen die Drachen fern bleiben.',
    'Die Taverne hat aufgeschlossen, {name} hat Geburtstag. Alles Gute!',
    'Auf {name}, heute Held oder Heldin des Tages – alles Gute zum Geburtstag!',

    // Ruhiger
    'Alles Gute zum Geburtstag, {name}. Ich hoffe, der Tag ist freundlich zu dir.',
    'Herzlichen Glückwunsch, {name} – nimm dir heute ein bisschen Zeit für dich.',
    'Einen guten Geburtstag, {name}. Ganz in deinem Tempo.',
];

// Optionale Zusatzzeile, wenn das Geburtsjahr hinterlegt ist (es ist freiwillig - wer keins angibt,
// bekommt nur den Glückwunsch). {alter} ist die Zahl der Jahre.
export const ALTERS_ZEILEN = [
    'Es sind {alter} Jahre geworden.',
    '{alter} Jahre – gut gemacht.',
    'Heute werden es {alter}.',
    'Runde {alter} Jahre auf dem Zähler.',
    'Der Zähler steht jetzt bei {alter}.',
    '{alter} Jahre und kein bisschen verrostet.',
    'Damit sind es {alter} Jahre.',
];
