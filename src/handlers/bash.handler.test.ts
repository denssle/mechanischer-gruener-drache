import {describe, it, expect, vi, beforeEach} from 'vitest';
import {MessageFlags, PermissionFlagsBits} from 'discord.js';

const service = vi.hoisted(() => ({
    speichereNeu: vi.fn(),
    hole: vi.fn(),
    holeAlle: vi.fn(),
    holeZufaellig: vi.fn(),
    findeNachNachricht: vi.fn(),
    aktualisiere: vi.fn(),
    entferne: vi.fn(),
    anzahl: vi.fn(),
}));
// Namensauflösung ist in anzeigename.service.test.ts geprüft; hier reicht ein fester Name je ID.
vi.mock('../services/anzeigename.service.js', () => ({
    UNBEKANNTER_NAME: 'unbekannt',
    holeAnzeigenamen: vi.fn(async (_guild: unknown, ids: string[]) => new Map(ids.map(id => [id, `Name-${id}`]))),
}));

vi.mock('../services/bash.service.js', () => ({default: service}));

import bashHandler, {darfBearbeiten, darfEntfernen, formatDatum, formatZitat, MODAL_PREFIX, parseDatum} from './bash.handler.js';
import {BashZitat} from '../services/bash.service.js';

const zitat = (overrides: Partial<BashZitat> = {}): BashZitat => ({
    nummer: 7,
    text: 'Ein Spruch',
    personId: 'person-1',
    kontext: '#plauderei',
    datum: '2026-03-12',
    erstellerId: 'ersteller-1',
    erstelltAm: '2026-08-25T10:00:00.000Z',
    quelle: {channelId: 'c1', messageId: 'm1'},
    ...overrides,
});

const slashInteraction = (overrides: Record<string, unknown> = {}) => ({
    options: {getInteger: vi.fn().mockReturnValue(null)},
    user: {id: 'ersteller-1'},
    memberPermissions: {has: vi.fn().mockReturnValue(false)},
    reply: vi.fn(),
    showModal: vi.fn(),
    ...overrides,
}) as any;

describe('parseDatum', () => {
    it('nimmt die deutsche Schreibweise an und speichert ISO', () => {
        expect(parseDatum('12.3.2026')).toEqual({ok: true, wert: '2026-03-12'});
    });

    it('deutet ein leeres Feld als bewusst weggelassen', () => {
        expect(parseDatum('  ')).toEqual({ok: true, wert: null});
    });

    // Ohne Round-Trip-Check würde daraus still der 03.03. - ein falsches Datum am Zitat wäre
    // schlimmer als gar keins.
    it('lehnt einen nicht existierenden Tag ab', () => {
        expect(parseDatum('31.02.2026')).toEqual({ok: false});
    });

    it('lehnt Unsinn ab', () => {
        expect(parseDatum('irgendwann 2019')).toEqual({ok: false});
    });
});

describe('formatZitat', () => {
    it('setzt jede Zeile als Blockzitat und hängt die Angaben an', () => {
        expect(formatZitat(zitat({text: 'A: hallo\nB: tschüss'}), 'Anna')).toBe(
            '**Zitat #7**\n> A: hallo\n> B: tschüss\n– Anna, #plauderei, 12.03.2026'
        );
    });

    it('lässt weggelassene Angaben einfach weg', () => {
        expect(formatZitat(zitat({kontext: null, datum: null}), 'Anna')).toBe(
            '**Zitat #7**\n> Ein Spruch\n– Anna'
        );
    });

    it('formatiert das gespeicherte ISO-Datum deutsch', () => {
        expect(formatDatum('2026-03-12')).toBe('12.03.2026');
        expect(formatDatum(null)).toBeNull();
    });
});

describe('Rechte', () => {
    it('lässt den Ersteller bearbeiten und entfernen', () => {
        const interaction = slashInteraction({user: {id: 'ersteller-1'}});
        expect(darfBearbeiten(zitat(), interaction)).toBe(true);
        expect(darfEntfernen(zitat(), interaction)).toBe(true);
    });

    it('lässt einen Admin bearbeiten und entfernen', () => {
        const interaction = slashInteraction({
            user: {id: 'fremd'},
            memberPermissions: {has: vi.fn((flag: bigint) => flag === PermissionFlagsBits.Administrator)},
        });
        expect(darfBearbeiten(zitat(), interaction)).toBe(true);
    });

    // Bewusste Asymmetrie: gegen den Willen der zitierten Person soll nichts stehen bleiben - ihre
    // Worte umschreiben darf sie aber nicht.
    it('lässt die zitierte Person entfernen, aber nicht bearbeiten', () => {
        const interaction = slashInteraction({user: {id: 'person-1'}});
        expect(darfEntfernen(zitat(), interaction)).toBe(true);
        expect(darfBearbeiten(zitat(), interaction)).toBe(false);
    });

    it('lässt Unbeteiligte weder bearbeiten noch entfernen', () => {
        const interaction = slashInteraction({user: {id: 'fremd'}});
        expect(darfBearbeiten(zitat(), interaction)).toBe(false);
        expect(darfEntfernen(zitat(), interaction)).toBe(false);
    });
});

describe('BashHandler – Erfassen per Rechtsklick', () => {
    beforeEach(() => vi.clearAllMocks());

    const kontextInteraction = (nachricht: Record<string, unknown>) => ({
        targetMessage: {
            content: 'Ein Spruch',
            id: 'm1',
            channelId: 'c1',
            channel: {name: 'plauderei'},
            author: {id: 'person-1'},
            createdTimestamp: Date.UTC(2026, 2, 12, 12),
            ...nachricht,
        },
        user: {id: 'ersteller-1'},
        reply: vi.fn(),
        showModal: vi.fn(),
    }) as any;

    it('öffnet ein Modal, das mit Wortlaut, Kanal und Datum vorbefüllt ist', async () => {
        service.findeNachNachricht.mockResolvedValue(null);
        const interaction = kontextInteraction({});

        await bashHandler.handleNachrichtSpeichern(interaction);

        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe(`${MODAL_PREFIX}:neu:person-1:c1:m1`);
        const werte = modal.components.map((zeile: any) => zeile.components[0].value);
        expect(werte[0]).toBe('Ein Spruch');
        expect(werte[1]).toBe('#plauderei');
        expect(werte[2]).toBe('12.03.2026');
    });

    it('lehnt Nachrichten ohne Text ab', async () => {
        const interaction = kontextInteraction({content: '   '});

        await bashHandler.handleNachrichtSpeichern(interaction);

        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
    });

    it('bremst, wenn dieselbe Nachricht schon in der Sammlung steht', async () => {
        service.findeNachNachricht.mockResolvedValue(zitat({nummer: 3}));
        const interaction = kontextInteraction({});

        await bashHandler.handleNachrichtSpeichern(interaction);

        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('#3');
    });
});

describe('BashHandler – Modal-Rücklauf', () => {
    beforeEach(() => vi.clearAllMocks());

    const modalInteraction = (customId: string, felder: Record<string, string>) => ({
        customId,
        fields: {getTextInputValue: vi.fn((feld: string) => felder[feld] ?? '')},
        user: {id: 'ersteller-1'},
        reply: vi.fn(),
    }) as any;

    it('ignoriert fremde Modals', async () => {
        const interaction = modalInteraction('anderes-feature:x', {});

        await bashHandler.handleModal(interaction);

        expect(interaction.reply).not.toHaveBeenCalled();
        expect(service.speichereNeu).not.toHaveBeenCalled();
    });

    it('speichert ein neues Zitat mit Person und Herkunft aus der customId', async () => {
        service.speichereNeu.mockResolvedValue(zitat());
        const interaction = modalInteraction(`${MODAL_PREFIX}:neu:person-1:c1:m1`, {
            text: 'Ein Spruch', kontext: '#plauderei', datum: '12.03.2026',
        });

        await bashHandler.handleModal(interaction);

        expect(service.speichereNeu).toHaveBeenCalledWith(expect.objectContaining({
            text: 'Ein Spruch',
            personId: 'person-1',
            kontext: '#plauderei',
            datum: '2026-03-12',
            erstellerId: 'ersteller-1',
            quelle: {channelId: 'c1', messageId: 'm1'},
        }));
    });

    // Zitattext ist Fremdtext: ohne die leere Allowlist pingt ein darin stehendes @everyone beim
    // Posten mit (siehe CLAUDE.md).
    it('antwortet ohne jede Erwähnung', async () => {
        service.speichereNeu.mockResolvedValue(zitat());
        const interaction = modalInteraction(`${MODAL_PREFIX}:neu:person-1:c1:m1`, {text: 'x'});

        await bashHandler.handleModal(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({allowedMentions: {parse: []}}));
    });

    it('lehnt ein unlesbares Datum ab, statt es zu verschlucken', async () => {
        const interaction = modalInteraction(`${MODAL_PREFIX}:neu:person-1:c1:m1`, {text: 'x', datum: 'gestern'});

        await bashHandler.handleModal(interaction);

        expect(service.speichereNeu).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
    });

    it('schreibt beim Bearbeiten nur Wortlaut, Kontext und Datum', async () => {
        service.aktualisiere.mockResolvedValue(zitat({text: 'neu'}));
        const interaction = modalInteraction(`${MODAL_PREFIX}:bearbeiten:7`, {text: 'neu', kontext: '', datum: ''});

        await bashHandler.handleModal(interaction);

        expect(service.aktualisiere).toHaveBeenCalledWith(7, {text: 'neu', kontext: null, datum: null});
    });

    it('meldet, wenn das Zitat zwischenzeitlich entfernt wurde', async () => {
        service.aktualisiere.mockResolvedValue(null);
        const interaction = modalInteraction(`${MODAL_PREFIX}:bearbeiten:7`, {text: 'neu'});

        await bashHandler.handleModal(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({flags: MessageFlags.Ephemeral}));
    });
});

describe('BashHandler – Befehle', () => {
    beforeEach(() => vi.clearAllMocks());

    it('zeigt ohne Nummer ein zufälliges Zitat', async () => {
        service.holeZufaellig.mockResolvedValue(zitat());
        const interaction = slashInteraction();

        await bashHandler.handleZitat(interaction);

        expect(service.holeZufaellig).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith({content: formatZitat(zitat(), 'Name-person-1'), allowedMentions: {parse: []}});
    });

    it('zeigt mit Nummer genau dieses Zitat', async () => {
        service.hole.mockResolvedValue(zitat({nummer: 69}));
        const interaction = slashInteraction({options: {getInteger: vi.fn().mockReturnValue(69)}});

        await bashHandler.handleZitat(interaction);

        expect(service.hole).toHaveBeenCalledWith(69);
    });

    it('erklärt eine freie Nummer als Lücke, statt sie neu zu vergeben', async () => {
        service.hole.mockResolvedValue(null);
        const interaction = slashInteraction({options: {getInteger: vi.fn().mockReturnValue(69)}});

        await bashHandler.handleZitat(interaction);

        expect(interaction.reply.mock.calls[0][0].content).toContain('Lücke');
    });

    it('weist auf den Rechtsklick hin, solange die Sammlung leer ist', async () => {
        service.holeZufaellig.mockResolvedValue(null);
        const interaction = slashInteraction();

        await bashHandler.handleZitat(interaction);

        expect(interaction.reply.mock.calls[0][0].content).toContain('Rechtsklick');
    });

    it('öffnet beim Bearbeiten das Modal mit den gespeicherten Werten', async () => {
        service.hole.mockResolvedValue(zitat());
        const interaction = slashInteraction({options: {getInteger: vi.fn().mockReturnValue(7)}});

        await bashHandler.handleBearbeiten(interaction);

        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe(`${MODAL_PREFIX}:bearbeiten:7`);
        expect(modal.components.map((z: any) => z.components[0].value)).toEqual(['Ein Spruch', '#plauderei', '12.03.2026']);
    });

    // Ein leeres `value` ist für Discord ein Wert der Laenge 0 und wird abgelehnt - das Feld muss
    // dann ganz ohne value rausgehen, sonst geht das Modal gar nicht erst auf.
    it('schickt leere Felder ohne value ins Modal', async () => {
        service.hole.mockResolvedValue(zitat({kontext: null, datum: null}));
        const interaction = slashInteraction({options: {getInteger: vi.fn().mockReturnValue(7)}});

        await bashHandler.handleBearbeiten(interaction);

        const felder = interaction.showModal.mock.calls[0][0].toJSON().components
            .map((zeile: any) => zeile.components[0]);
        expect(felder[0].value).toBe('Ein Spruch');
        expect(felder[1].value).toBeUndefined();
        expect(felder[2].value).toBeUndefined();
    });

    it('lässt Unbeteiligte nicht bearbeiten', async () => {
        service.hole.mockResolvedValue(zitat());
        const interaction = slashInteraction({
            user: {id: 'fremd'},
            options: {getInteger: vi.fn().mockReturnValue(7)},
        });

        await bashHandler.handleBearbeiten(interaction);

        expect(interaction.showModal).not.toHaveBeenCalled();
    });

    it('entfernt ein Zitat und behält die Nummer als Lücke', async () => {
        service.hole.mockResolvedValue(zitat());
        const interaction = slashInteraction({options: {getInteger: vi.fn().mockReturnValue(7)}});

        await bashHandler.handleEntfernen(interaction);

        expect(service.entferne).toHaveBeenCalledWith(7);
        expect(interaction.reply.mock.calls[0][0].content).toContain('frei');
    });

    it('lässt Unbeteiligte nicht entfernen', async () => {
        service.hole.mockResolvedValue(zitat());
        const interaction = slashInteraction({
            user: {id: 'fremd'},
            options: {getInteger: vi.fn().mockReturnValue(7)},
        });

        await bashHandler.handleEntfernen(interaction);

        expect(service.entferne).not.toHaveBeenCalled();
    });

    it('nennt Bestand und höchste Nummer', async () => {
        service.holeAlle.mockResolvedValue([zitat({nummer: 3}), zitat({nummer: 9})]);
        const interaction = slashInteraction();

        await bashHandler.handleAnzahl(interaction);

        expect(interaction.reply.mock.calls[0][0]).toContain('2 Zitate');
        // Die höchste Nummer gehört dazu, weil gelöschte Nummern nie nachrücken - aus "2 Zitate"
        // allein ließe sich sonst auf die Nummern schließen.
        expect(interaction.reply.mock.calls[0][0]).toContain('#9');
    });

    it('sagt bei leerer Sammlung, wie man sie füllt', async () => {
        service.holeAlle.mockResolvedValue([]);
        const interaction = slashInteraction();

        await bashHandler.handleAnzahl(interaction);

        expect(interaction.reply.mock.calls[0][0].content).toContain('noch leer');
        expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
    });

    it('nennt in der Hilfe alle Befehle und den Weg zum Festhalten', async () => {
        const interaction = slashInteraction();

        await bashHandler.handleHilfe(interaction);

        const text = interaction.reply.mock.calls[0][0] as string;
        expect(text).toContain('/bash zitat');
        expect(text).toContain('/bash anzahl');
        expect(text).toContain('Rechtsklick');
    });
});
