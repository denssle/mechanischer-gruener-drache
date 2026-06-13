# Mechanischer Grüner Drache 🐲

Ein einfacher Discord-Bot, basierend auf [discord.js](https://discord.js.org/).

## 📋 Voraussetzungen

Bevor du startest, stelle sicher, dass du folgende Software installiert hast:
- [Node.js](https://nodejs.org/) (Version 16.9.0 oder höher empfohlen)
- npm (wird normalerweise mit Node.js installiert)

## 🚀 Installation

1. Klone das Repository oder lade die Dateien herunter.
2. Öffne ein Terminal im Projektverzeichnis.
3. Installiere die benötigten Abhängigkeiten:
   ```bash
   npm install
   ```

## ⚙️ Konfiguration

Der Bot benötigt ein Token, um sich mit Discord zu verbinden. 

1. Erstelle eine Datei namens `config.json` im Hauptverzeichnis (falls nicht vorhanden).
2. Füge dein Bot-Token in die Datei ein:
   ```json
   {
     "BOT_TOKEN": "DEIN_BOT_TOKEN_HIER"
   }
   ```
   *Hinweis: Erhalte dein Token im [Discord Developer Portal](https://discord.com/developers/applications).*

## 🛠️ Starten

Um den Bot zu starten, führe folgenden Befehl aus:
```bash
node index.ts
```
Sobald der Bot online ist, erscheint die Meldung `Bot is online` in der Konsole.

## 🔒 Sicherheitshinsweis

**Teile niemals deine `config.json` oder dein Bot-Token mit anderen!** Wenn dein Token öffentlich wird, können andere Personen deinen Bot steuern. Die `.gitignore` Datei sollte bereits so eingestellt sein, dass die `config.json` nicht hochgeladen wird.

## 📝 Lizenz

Dieses Projekt ist privat.
