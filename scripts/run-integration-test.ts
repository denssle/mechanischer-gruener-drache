import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const startServerAndTest = async () => {
    console.log('Starte Twitch Integrationstest...');

    // Sicherstellen, dass dist existiert
    if (!fs.existsSync(path.join(process.cwd(), 'dist'))) {
        console.log('Build nicht gefunden. Führe npm run build aus...');
        await new Promise((resolve, reject) => {
            const build = spawn('npm', ['run', 'build'], { shell: true, stdio: 'inherit' });
            build.on('close', (code) => code === 0 ? resolve(null) : reject(new Error('Build fehlgeschlagen')));
        });
    }

    // Server im Hintergrund starten
    const server = spawn('node', ['dist/index.js'], {
        env: { ...process.env, CI: 'true' }, // CI=true verhindert Discord Login
        shell: true
    });

    server.stdout.on('data', (data) => {
        console.log(`[Server] ${data}`);
    });

    server.stderr.on('data', (data) => {
        console.error(`[Server Error] ${data}`);
    });

    // Warten bis der Server bereit ist (3 Sekunden sollten reichen)
    console.log('Warte auf Server-Start...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        console.log('Führe Webhook-Test (notify) aus...');
        await new Promise((resolve, reject) => {
            const test = spawn('node', ['dist-scripts/test-twitch-webhook.js', 'notify'], {
                shell: true,
                stdio: 'inherit'
            });
            test.on('close', (code) => code === 0 ? resolve(null) : reject(new Error('Test fehlgeschlagen')));
        });

        console.log('Integrationstest erfolgreich abgeschlossen!');
    } catch (error) {
        console.error('Fehler beim Integrationstest:', error instanceof Error ? error.message : error);
        process.exit(1);
    } finally {
        console.log('Beende Server...');
        server.kill();
        // In Windows muss man manchmal aggressiver killen wenn shell: true benutzt wurde
        if (process.platform === 'win32' && server.pid) {
            spawn('taskkill', ['/pid', server.pid.toString(), '/f', '/t']);
        }
    }
};

startServerAndTest();
