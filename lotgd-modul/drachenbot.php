<?php
// Drachenbot-Modul fuer LotGD 1.x (Dragonprime Edition).
// Stellt Spielern ein widerrufbares Read-Only-Token aus, mit dem sich der
// Discord-Bot "Mechanischer Gruener Drache" authentifizieren kann.
// Siehe README im selben Verzeichnis. Stand: Grundgeruest (Phase 2 folgt).

function drachenbot_getmoduleinfo() {
	$info = array(
		"name" => "Drachenbot-Verknuepfung",
		"version" => "0.1",
		"author" => "Dominik Hellweg",
		"category" => "Administrative",
		"download" => "",
		// Der op=api-Zweig muss ohne Login erreichbar sein (der Bot hat keine
		// Spielsitzung). Alle anderen Ops pruefen selbst auf eingeloggten User.
		"allowanonymous" => true,
		"override_forced_nav" => true,
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

function drachenbot_run() {
	global $session;
	$op = httpget('op');

	if ($op == "api") {
		// Phase 2: Token pruefen, Whitelist-Felder als JSON liefern.
		header("Content-Type: application/json; charset=utf-8");
		echo json_encode(array("error" => "not implemented"));
		exit;
	}

	// Alles ab hier ist die Token-Verwaltung fuer eingeloggte Spieler.
	if (!$session['user']['loggedin']) {
		redirect("index.php");
	}

	page_header("Drachenbot-Verknuepfung");
	output("`bDrachenbot-Verknuepfung`b`n`n");
	output("Hier entsteht die Token-Verwaltung (Phase 2).`n");
	villagenav();
	page_footer();
}
?>
