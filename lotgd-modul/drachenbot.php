<?php
// Drachenbot-Modul fuer LotGD 1.x (Dragonprime Edition).
//
// Stellt Spielern ein widerrufbares Read-Only-Token aus, mit dem der
// Discord-Bot "Mechanischer Gruener Drache" oeffentliche Charakterdaten
// abfragen kann. Es wird NIE das Token selbst gespeichert, sondern nur sein
// sha256-Hash (ein DB-Leak verraet keine gueltigen Tokens). Das Modul
// schreibt keinerlei Spieldaten und hat keine Superuser-Funktionen.
//
// Hinweis Zeichensatz: Dieses File benutzt bewusst nur ASCII (ue/oe/ae),
// damit es unabhaengig vom File-Encoding im ISO-8859-1-Spiel korrekt anzeigt.
//
// Lizenz: CC BY-NC-SA 2.0 (https://creativecommons.org/licenses/by-nc-sa/2.0/),
// wie LotGD 1.x Dragonprime Edition selbst, auf dessen Modul-API dieses Modul
// aufbaut (Share-Alike). Autor: Dominik Hellweg, 2026.

function drachenbot_getmoduleinfo() {
	$info = array(
		"name" => "Drachenbot-Verknuepfung",
		"version" => "0.2",
		"author" => "Dominik Hellweg",
		"category" => "Administrative",
		"download" => "",
		// Der op=api-Zweig muss ohne Login erreichbar sein (der Bot hat keine
		// Spielsitzung). Alle anderen Ops pruefen selbst auf eingeloggten User.
		"allowanonymous" => true,
		"override_forced_nav" => true,
		"prefs" => array(
			"Drachenbot-Verknuepfung Benutzer-Einstellungen,title",
			"tokenhash" => "sha256-Hash des Bot-Tokens,text|",
			"tokencreated" => "Token erstellt am,text|",
		),
	);
	return $info;
}

function drachenbot_install() {
	module_addhook("village");
	return true;
}

function drachenbot_uninstall() {
	// Modul-Prefs (Token-Hashes) raeumt der LotGD-Kern beim Deinstallieren
	// selbst aus module_userprefs - es bleibt nichts zurueck.
	return true;
}

function drachenbot_dohook($hookname, $args) {
	if ($hookname == "village") {
		addnav("Drachenbot (Discord)", "runmodule.php?module=drachenbot");
	}
	return $args;
}

// Kryptografisch zufaelliges Token, PHP-5-kompatibel.
function drachenbot_create_token() {
	if (function_exists('random_bytes')) {
		return bin2hex(random_bytes(16));
	}
	if (function_exists('openssl_random_pseudo_bytes')) {
		return bin2hex(openssl_random_pseudo_bytes(16));
	}
	// Letzter Ausweg (sollte auf keinem realen Host noetig sein).
	return md5(uniqid(mt_rand(), true)) . md5(uniqid(mt_rand(), true));
}

// LotGD-Farbcodes (Backtick + Zeichen) aus Anzeigenamen entfernen.
function drachenbot_strip_codes($text) {
	return preg_replace('/`./', '', $text);
}

// Read-Only-Endpunkt fuer den Discord-Bot. Anonym erreichbar (siehe
// getmoduleinfo), authentifiziert ausschliesslich ueber das Token.
// Liefert NUR die unten fest verdrahtete Feld-Whitelist, schreibt nichts
// und startet keine Spielsitzung (der Spieler erscheint nicht als "online").
function drachenbot_api() {
	header("Content-Type: application/json; charset=utf-8");

	$token = httpget('token');
	// Unsere Tokens sind 32 Hex-Zeichen; alles andere sofort ablehnen
	// (haelt zugleich jede Nicht-Hex-Eingabe aus dem SQL heraus).
	if (!is_string($token) || !preg_match('/^[a-f0-9]{32}$/', $token)) {
		drachenbot_api_fail();
	}
	$hash = hash("sha256", $token);

	// Alle Token-Hashes holen und in PHP mit hash_equals vergleichen
	// (konstante Zeit; bei einigen hundert Accounts problemlos).
	$sql = "SELECT userid, value FROM " . db_prefix("module_userprefs")
		. " WHERE modulename='drachenbot' AND setting='tokenhash' AND value<>''";
	$result = db_query($sql);
	$acctid = 0;
	while ($row = db_fetch_assoc($result)) {
		if (drachenbot_hash_equals($row['value'], $hash)) {
			$acctid = (int)$row['userid'];
			// Kein break: alle Zeilen durchlaufen, damit die Antwortzeit
			// nicht verraet, an welcher Position der Treffer lag.
		}
	}
	if ($acctid == 0) {
		drachenbot_api_fail();
	}

	// Feste Feld-Whitelist - bewusst NUR oeffentliche bzw. unkritische
	// Werte, keine Login-/Mail-/Passwort-Spalten. Erweiterungen bitte nur
	// nach Absprache mit den Betreibern.
	$sql = "SELECT name, level, race, sex, alive, location, gold, gems,"
		. " experience, dragonkills, hitpoints, maxhitpoints, laston"
		. " FROM " . db_prefix("accounts") . " WHERE acctid=$acctid";
	$result = db_query($sql);
	if (db_num_rows($result) != 1) {
		drachenbot_api_fail();
	}
	$u = db_fetch_assoc($result);

	$data = array(
		"name" => utf8_encode(drachenbot_strip_codes($u['name'])),
		"level" => (int)$u['level'],
		"race" => utf8_encode($u['race']),
		"sex" => ((int)$u['sex'] == 0) ? "m" : "w",
		"alive" => ((int)$u['alive'] == 1),
		"location" => utf8_encode($u['location']),
		"gold" => (int)$u['gold'],
		"gems" => (int)$u['gems'],
		"experience" => (int)$u['experience'],
		"dragonkills" => (int)$u['dragonkills'],
		"hitpoints" => (int)$u['hitpoints'],
		"maxhitpoints" => (int)$u['maxhitpoints'],
		"laston" => $u['laston'],
	);
	echo json_encode($data);
	exit;
}

// Einheitliche Fehlerantwort: generisch (kein Unterschied zwischen
// "Token unbekannt" und "widerrufen") und mit kleiner Bremse gegen
// Brute-Force-Raten.
function drachenbot_api_fail() {
	usleep(500000); // 0,5s
	header("HTTP/1.1 401 Unauthorized");
	echo json_encode(array("error" => "invalid token"));
	exit;
}

// hash_equals gibt es erst ab PHP 5.6 - Fallback fuer aeltere Hosts.
function drachenbot_hash_equals($known, $user) {
	if (function_exists('hash_equals')) {
		return hash_equals($known, $user);
	}
	if (strlen($known) != strlen($user)) return false;
	$diff = 0;
	for ($i = 0; $i < strlen($known); $i++) {
		$diff |= ord($known[$i]) ^ ord($user[$i]);
	}
	return $diff == 0;
}

function drachenbot_run() {
	global $session;
	$op = httpget('op');

	if ($op == "api") {
		drachenbot_api();
		exit;
	}

	// Alles ab hier ist die Token-Verwaltung fuer eingeloggte Spieler.
	if (!$session['user']['loggedin']) {
		redirect("index.php");
	}

	page_header("Drachenbot-Verknuepfung");
	$hash = get_module_pref("tokenhash");

	if ($op == "generate") {
		$token = drachenbot_create_token();
		set_module_pref("tokenhash", hash("sha256", $token));
		set_module_pref("tokencreated", date("Y-m-d H:i:s"));
		output("`@`bDein neues Bot-Token:`b`0`n`n");
		rawoutput("<div style='font-size: 1.3em; padding: 8px;'><code>" . $token . "</code></div>");
		output("`n`2Kopiere es `bjetzt`b - aus Sicherheitsgruenden wird es `bnur dieses eine Mal`b angezeigt.");
		output("Das Spiel merkt sich nur einen Pruefwert (Hash), nicht das Token selbst.`n`n");
		output("Hinterlege es dann in Discord beim Drachenbot (Befehl `i/charakter`i).`n`n");
		output("Solltest du das Token verlieren, erzeuge hier einfach ein neues - das alte wird dabei ungueltig.`n");
	} elseif ($op == "revoke") {
		set_module_pref("tokenhash", "");
		set_module_pref("tokencreated", "");
		output("`@Dein Bot-Token wurde widerrufen.`0`n`n");
		output("`2Der Discord-Bot kann ab sofort nicht mehr auf deine Charakterdaten zugreifen.");
		output("Du kannst jederzeit ein neues Token erzeugen.`n");
	} else {
		output("`bDrachenbot-Verknuepfung`b`n`n");
		output("`2Der Drachenbot ist der Discord-Bot des Community-Servers.");
		output("Mit einem Token kann er deine Charakterdaten (Level, Ort, Gold, ...) im Discord anzeigen -");
		output("`bnur lesen`b, er kann nichts in deinem Namen tun.`n`n");
		if ($hash > "") {
			$created = get_module_pref("tokencreated");
			output("`^Es ist ein Token aktiv`2 (erstellt am %s).`n", $created);
			output("Das Token selbst kann nicht erneut angezeigt werden - bei Verlust einfach ein neues erzeugen.`n");
		} else {
			output("`2Derzeit ist `bkein`b Token aktiv.`n");
		}
	}

	$hashNow = get_module_pref("tokenhash");
	if ($hashNow > "") {
		if ($op != "generate") {
			addnav("Neues Token erzeugen (altes wird ungueltig)", "runmodule.php?module=drachenbot&op=generate");
		}
		addnav("Token widerrufen", "runmodule.php?module=drachenbot&op=revoke");
	} else {
		addnav("Token erzeugen", "runmodule.php?module=drachenbot&op=generate");
	}
	villagenav();
	page_footer();
}
?>
