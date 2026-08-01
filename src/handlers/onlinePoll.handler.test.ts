import {describe, it, expect, vi, beforeEach} from 'vitest';

const getOnline = vi.hoisted(() => vi.fn());
vi.mock('../services/online.service.js', () => ({default: {getOnline}}));

const beobachten = vi.hoisted(() => ({
    brauchtOnlineStand: vi.fn(),
    verarbeiteOnlineStand: vi.fn(),
}));
vi.mock('./beobachten.handler.js', () => ({default: beobachten}));

const drachen = vi.hoisted(() => ({
    brauchtOnlineStand: vi.fn(),
    pruefeLevel: vi.fn(),
}));
vi.mock('./drachen.handler.js', () => ({default: drachen}));

import onlinePollHandler, {POLL_INTERVALL_MS} from './onlinePoll.handler.js';

const spieler = [{gilde: '', name: 'Centurio Acaine', ort: 'Romar', level: '12', rasse: 'Mensch', lebt: true}];

// Der Poller merkt sich den letzten Abruf im Speicher und überlebt als Singleton die einzelnen
// Tests - die Testuhr muss deshalb monoton weiterlaufen, sonst läge der gemerkte Zeitpunkt in
// der Zukunft und jeder Poll stiege sofort wieder aus.
let basis = new Date('2026-08-01T12:00:00').getTime();

// Ein Durchlauf, der den Takt sicher überspringt.
async function pollen() {
    vi.setSystemTime(Date.now() + POLL_INTERVALL_MS + 1000);
    await onlinePollHandler.poll();
}

describe('OnlinePollHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        basis += 60 * 60 * 1000;
        vi.setSystemTime(basis);
        getOnline.mockResolvedValue({players: spieler, recent: []});
        beobachten.brauchtOnlineStand.mockResolvedValue(true);
        drachen.brauchtOnlineStand.mockResolvedValue(true);
    });

    it('holt den Stand einmal und reicht ihn an beide Abnehmer weiter', async () => {
        await pollen();

        expect(getOnline).toHaveBeenCalledTimes(1);
        expect(beobachten.verarbeiteOnlineStand).toHaveBeenCalledWith(spieler);
        expect(drachen.pruefeLevel).toHaveBeenCalledWith(spieler);
    });

    // Der Kern der Auslagerung: die Drachenerkennung darf NICHT davon abhängen, dass jemand
    // eine Beobachtungsliste führt - sonst hörten die Gratulationen still auf, sobald der
    // letzte Beobachter seinen Eintrag herausnimmt.
    it('ruft auch dann ab, wenn nur die Drachen-Gratulation den Stand braucht', async () => {
        beobachten.brauchtOnlineStand.mockResolvedValue(false);

        await pollen();

        expect(getOnline).toHaveBeenCalledTimes(1);
        expect(drachen.pruefeLevel).toHaveBeenCalledWith(spieler);
        expect(beobachten.verarbeiteOnlineStand).not.toHaveBeenCalled();
    });

    it('ruft auch dann ab, wenn nur die Beobachtungsliste den Stand braucht', async () => {
        drachen.brauchtOnlineStand.mockResolvedValue(false);

        await pollen();

        expect(getOnline).toHaveBeenCalledTimes(1);
        expect(beobachten.verarbeiteOnlineStand).toHaveBeenCalledWith(spieler);
        expect(drachen.pruefeLevel).not.toHaveBeenCalled();
    });

    // Will keiner die Daten, gehört lotgd.de in Ruhe gelassen.
    it('behelligt lotgd.de nicht, wenn kein Abnehmer den Stand braucht', async () => {
        beobachten.brauchtOnlineStand.mockResolvedValue(false);
        drachen.brauchtOnlineStand.mockResolvedValue(false);

        await pollen();

        expect(getOnline).not.toHaveBeenCalled();
    });

    it('ruft lotgd.de nur im eingestellten Takt ab, nicht bei jedem Timer-Schlag', async () => {
        await pollen();
        await onlinePollHandler.poll(); // gleich danach nochmal
        vi.setSystemTime(Date.now() + 60 * 1000);
        await onlinePollHandler.poll(); // eine Minute später

        expect(getOnline).toHaveBeenCalledTimes(1);
    });

    // Sonst liefe die Bedarfsabfrage jede Minute statt alle fünf.
    it('schiebt den Takt auch dann weiter, wenn niemand die Daten braucht', async () => {
        beobachten.brauchtOnlineStand.mockResolvedValue(false);
        drachen.brauchtOnlineStand.mockResolvedValue(false);

        await pollen();
        await onlinePollHandler.poll();

        expect(beobachten.brauchtOnlineStand).toHaveBeenCalledTimes(1);
    });

    // Eine leere Liste wäre für die Beobachtungsliste fatal: danach gälte jeder Eingeloggte
    // als frisch online.
    it('reicht bei kaputtem Abruf gar nichts weiter, nicht etwa eine leere Liste', async () => {
        getOnline.mockResolvedValue(null);

        await pollen();

        expect(beobachten.verarbeiteOnlineStand).not.toHaveBeenCalled();
        expect(drachen.pruefeLevel).not.toHaveBeenCalled();
    });

    it('läuft nicht in einen Fehler, wenn ein Abnehmer wirft', async () => {
        const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
        beobachten.brauchtOnlineStand.mockRejectedValue(new Error('Redis weg'));

        await expect(pollen()).resolves.toBeUndefined();
        expect(fehler).toHaveBeenCalled();

        fehler.mockRestore();
    });
});
