import {Request, Response, Router} from 'express';
import {pruefeGesundheit} from '../services/gesundheit.service.js';

// Öffentlicher Gesundheits-Endpunkt für uptime.yml. Liegt unter /config, weil nginx auf dem Host nur
// /twitch und /config an den Bot weiterreicht; ein eigener Pfad bräuchte ein weiteres
// `uberspace web backend set`, also noch eine Einstellung, die nur auf dem Host lebt. Muss in index.ts
// VOR dem configRouter hängen, sonst greift dort der Login.
// 200 + "ok" = gesund, 503 + Befund = krank. Läuft der Bot gar nicht, liefert nginx 502.

export function gesundheitHandler(_req: Request, res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    pruefeGesundheit()
        .then((probleme) => {
            if (probleme.length === 0) {
                res.status(200).type('text').send('ok');
            } else {
                res.status(503).type('text').send(probleme.join('\n'));
            }
        })
        .catch((error) => {
            console.error('Fehler in der Gesundheitsprüfung:', error);
            if (!res.headersSent) {
                res.status(503).type('text').send('Gesundheitsprüfung fehlgeschlagen');
            }
        });
}

const gesundheitRouter = Router();
gesundheitRouter.get('/config/gesundheit', gesundheitHandler);

export default gesundheitRouter;
