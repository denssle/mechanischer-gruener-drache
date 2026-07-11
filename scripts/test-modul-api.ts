// End-to-End-Test gegen den Read-Only-Endpunkt des LotGD-Drachenbot-Moduls
// (lotgd-modul/drachenbot.php, laeuft in der lokalen Sandbox aus lotgd-modul/docker).
//
// Aufruf: node dist-scripts/test-modul-api.js <token> [baseUrl]
//   <token>  im Spiel erzeugtes Bot-Token (Dorf -> "Drachenbot (Discord)")
//   [baseUrl] Standard: http://localhost:8080
//
// Prueft den Positivfall (gueltiges Token -> JSON mit den Whitelist-Feldern)
// und den Negativfall (falsches Token -> 401 mit generischer Fehlermeldung).

const token = process.argv[2];
const baseUrl = process.argv[3] ?? 'http://localhost:8080';

if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    console.error('Bitte ein gueltiges Token angeben (32 Hex-Zeichen).');
    console.error('Aufruf: node dist-scripts/test-modul-api.js <token> [baseUrl]');
    process.exit(1);
}

const apiUrl = (t: string) =>
    `${baseUrl}/runmodule.php?module=drachenbot&op=api&token=${t}`;

// Die Felder, die das Modul laut Whitelist liefern muss.
const expectedFields = [
    'name', 'level', 'race', 'sex', 'alive', 'location', 'gold', 'gems',
    'experience', 'dragonkills', 'hitpoints', 'maxhitpoints', 'laston',
];

let failed = false;

const fail = (msg: string) => {
    console.error(`FEHLER: ${msg}`);
    failed = true;
};

const run = async () => {
    // Positivfall
    console.log(`Rufe API mit gueltigem Token auf: ${baseUrl} ...`);
    const ok = await fetch(apiUrl(token));
    if (ok.status !== 200) {
        fail(`Erwartet HTTP 200, bekommen: ${ok.status}`);
    } else {
        const data = await ok.json() as Record<string, unknown>;
        const missing = expectedFields.filter((f) => !(f in data));
        if (missing.length > 0) {
            fail(`Felder fehlen in der Antwort: ${missing.join(', ')}`);
        } else {
            console.log('Antwort vollstaendig:');
            console.log(JSON.stringify(data, null, 2));
        }
    }

    // Negativfall: falsches Token muss generisch abgelehnt werden.
    console.log('\nRufe API mit falschem Token auf ...');
    const bad = await fetch(apiUrl('0'.repeat(32)));
    if (bad.status !== 401) {
        fail(`Erwartet HTTP 401, bekommen: ${bad.status}`);
    } else {
        const err = await bad.json() as Record<string, unknown>;
        if (err.error !== 'invalid token') {
            fail(`Erwartet generische Fehlermeldung, bekommen: ${JSON.stringify(err)}`);
        } else {
            console.log('Korrekt abgelehnt (401, generische Meldung).');
        }
    }

    console.log(failed ? '\nTest FEHLGESCHLAGEN.' : '\nAlles gut.');
    process.exit(failed ? 1 : 0);
};

run().catch((error) => {
    console.error('Test abgebrochen:', error);
    process.exit(1);
});
