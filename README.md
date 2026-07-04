# Mechanischer Grüner Drache 🐲

Ein Discord-Bot für den Discord-Server von [LotgD](http://www.lotgd.de/), geschrieben in TypeScript.

## 🚀 Features

- **Ping-Pong Spiel**: Ein einfaches Spiel mit Highscore-System (gespeichert in Redis).
- **Twitch-Integration**: Sendet Benachrichtigungen, wenn ein Streamer online geht (via Webhooks).
- **Sport-Tracking**: Verfolgung von sportlichen Aktivitäten (Summe der Kilometer).
- **Automatisches Rollen-Management**: Aktualisiert User-Daten bei Namensänderungen oder Rollen-Updates.
- **Nachrichten-Logging**: Postet bearbeitete/gelöschte Nachrichten (inkl. Massen-Löschungen), Server-Beitritte/-Austritte, Rollen- und Nickname-Änderungen, Timeouts/Mutes sowie Bans/Unbans in einen konfigurierbaren Log-Channel (`/protokoll`).
- **Rollen-Selbstvergabe**: Ein Admin postet mit `/rollenbutton` eine Nachricht mit einem Button; per Klick geben sich User selbst eine Rolle (nochmal klicken entfernt sie wieder), z.B. für die Regelakzeptanz oder Twitch-Benachrichtigungen. Der Bot braucht dafür "Rollen verwalten"-Rechte und muss in der Rollen-Hierarchie über der zu vergebenden Rolle stehen.

## 🛠 Architektur

Das Projekt folgt dem Prinzip der *Separation of Concerns*:

- **`src/commands`**: Definition der Slash-Commands für Discord.
- **`src/handlers`**: Steuerung der Logik und Reaktion auf Events (Discord Interactions, Twitch Webhooks).
- **`src/services`**: Infrastruktur-Logik (Redis-Datenbankzugriff, Twitch-API-Logik, Sport-Daten).
- **`src/server`**: Express-Server für den Empfang von Twitch-Webhooks.
- **`src/types`**: Zentrale Typ-Definitionen und Interfaces.

## 📦 Installation & Setup

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

2. **Konfiguration:**
   Erstelle eine `config.json` im Hauptverzeichnis (siehe `.gitignore`):
   ```json
   {
     "BOT_TOKEN": "DEIN_DISCORD_TOKEN",
     "CLIENT_ID": "DEIN_BOT_CLIENT_ID",
     "GUILD_ID": "DEINE_SERVER_ID",
     "TWITCH_WEBHOOK_SECRET": "DEIN_GEHEIMNIS",
     "TWITCH_CLIENT_ID": "DEINE_TWITCH_CLIENT_ID",
     "TWITCH_CLIENT_SECRET": "DEIN_TWITCH_CLIENT_SECRET"
   }
   ```
   `TWITCH_WEBHOOK_CALLBACK_URL` ist optional und muss nur gesetzt werden, wenn der Webhook nicht unter der Standard-URL in `twitch.service.ts` erreichbar ist.

3. **Befehle registrieren:**
   ```bash
   npm run build
   node dist/deploy-commands.js
   ```

4. **Bot starten:**
   ```bash
   npm start
   ```

## 🧪 Testing

### Automatisierte Tests
Wir nutzen **Vitest** für Unit- und Integrationstests. Diese werden auch bei jedem Push auf `main` via GitHub Actions ausgeführt.
```bash
npm test
```

### Twitch Integrationstest (automatisiert)
Um den Twitch-Webhook-Ablauf lokal automatisiert zu testen (startet intern den Server, sendet einen Test-Webhook und beendet den Server wieder):
```bash
npm run test:twitch
```

### Manueller Twitch-Webhook Test
Um den Webhook-Server lokal manuell zu testen:
1. Bot starten (`npm start`).
2. In einem neuen Terminal:
   ```bash
   npm run build:scripts
   node dist-scripts/test-twitch-webhook.js notify
   ```

## ✅ Fortschritt / Todo

- [x] Architektur-Refactoring & Typsicherheit
- [x] Redis-Anbindung (stabilisiert)
- [x] Twitch-Integration & Webhook-Server
- [x] Umfangreiche Testabdeckung
- [x] Logging (bearbeitete/gelöschte Nachrichten via `/protokoll kanal:<#channel>`)
- [x] Rollen-Selbstvergabe (Button-Rollen via `/rollenbutton`)
- [ ] Gesamtkilometerzähler zurücksetzen
- [ ] Tage bis zum Treffen
- [ ] News aus dem Game anzeigen (https://www.lotgd.de/news.php)
- [x] Sport: Summe der Kilometer bearbeitbar (`/sport bearbeiten` für eigene Einträge, `/sport setzen` als Admin-Korrektur)
- [ ] Den Bot generalisieren für jeden Server
- [ ] CI/Deploy-Workflow auf eine neuere Node-Version heben (Node 20 wird für GitHub Actions deprecated)
