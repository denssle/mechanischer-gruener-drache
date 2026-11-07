#!/usr/bin/env bash
# Tägliches Backup der Redis-Daten auf dem Uberspace, Einrichtung und Zurückspielen: docs/betrieb.md.
# Liegt bewusst außerhalb des Repo-Ordners: rsync --delete räumt dort beim Deploy alles Fremde weg.
set -euo pipefail

ziel="$HOME/backups/drache"
behalten_tage=14

mkdir -p "$ziel"
chmod 700 "$ziel"

datei="$ziel/redis-$(date +%F).rdb"
redis-cli -s "$HOME/.redis/sock" --rdb "$datei"
chmod 600 "$datei"

# Ein leerer Dump soll die alten Stände nicht verdrängen.
if [ ! -s "$datei" ]; then
    echo "Backup ist leer: $datei" >&2
    exit 1
fi

find "$ziel" -name 'redis-*.rdb' -mtime +"$behalten_tage" -delete
