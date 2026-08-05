import { describe, it, expect, vi } from 'vitest';

// commands/index.js zieht sämtliche Commands und damit alle Handler hoch. client.js muss deshalb
// gemockt werden: sonst greift die dokumentierte Zirkular-Import-Falle
// (client.ts -> commands/index.js -> *.command.ts -> handler -> client.ts) und der Import scheitert
// mit "default is not iterable". Wir brauchen hier ohnehin nur die Command-Definitionen.
vi.mock('../client.js', () => ({
    default: {commands: new Map(), on: vi.fn(), once: vi.fn(), channels: {fetch: vi.fn()}, guilds: {cache: new Map()}}
}));

import hilfeHandler, { HELP_TEXT } from './hilfe.handler.js';
import commands, { NUR_ADMIN_BEFEHLE as NUR_ADMIN } from '../commands/index.js';

// Aus der Command-Registrierung abgeleitet statt gepflegt: ein Befehl ist "flach", wenn er keinen
// Subcommand (und keine Subcommand-Gruppe) hat - dann kann er kein eigenes `hilfe` tragen, weil
// Discord ab dem ersten Subcommand IMMER einen verlangt (das blanke /news fiele weg).
// Der Options-Typ 1 ist SUB_COMMAND, 2 ist SUB_COMMAND_GROUP.
const SUBCOMMAND_TYPEN = [1, 2];

const optionsTypen = (command: {data: {options: {toJSON(): {type: number}}[]}}): number[] =>
    command.data.options.map(option => option.toJSON().type);

const hatSubcommands = (command: any): boolean =>
    optionsTypen(command).some(typ => SUBCOMMAND_TYPEN.includes(typ));

const flacheBefehle = (): string[] =>
    (commands as any[]).filter(c => !hatSubcommands(c)).map(c => c.data.name);

const gruppenBefehle = (): string[] =>
    (commands as any[]).filter(c => hatSubcommands(c)).map(c => c.data.name);

describe('HilfeHandler', () => {
    it('antwortet mit der Gesamt-Übersicht', async () => {
        const interaction = { reply: vi.fn() } as any;

        await hilfeHandler.handleHilfe(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(HELP_TEXT);
    });

    // Flache Einzelbefehle haben kein eigenes `hilfe` (siehe Design-Entscheidung) - sie werden NUR
    // hier erklärt. Die Liste wird bewusst AUS DER COMMAND-REGISTRIERUNG abgeleitet statt
    // hartcodiert: eine handgepflegte Liste bliebe grün, wenn jemand einen neuen flachen Befehl
    // hinzufügt und die Hilfe vergisst - also genau in dem Fall, den dieser Test abfangen soll.
    // Ein neuer Befehl erzwingt jetzt entweder einen HELP_TEXT-Eintrag oder eine bewusste Ausnahme.
    it.each(flacheBefehle().filter(name => !NUR_ADMIN.includes(name)))(
        'erwähnt den flachen Befehl /%s (der sonst nirgends dokumentiert ist)',
        (name) => {
            expect(HELP_TEXT).toContain(`/${name}`);
        }
    );

    // Gegenprobe zur Ableitung: findet der Test überhaupt noch flache Befehle? Ohne das würde eine
    // kaputte Ableitung (leeres Array) als "alles grün" durchgehen - it.each([]) läuft nie.
    it('findet überhaupt flache Befehle zum Prüfen', () => {
        expect(flacheBefehle().filter(name => !NUR_ADMIN.includes(name)).length).toBeGreaterThanOrEqual(6);
    });

    // Admin-Befehle stehen bewusst NICHT in der Übersicht - hier festgehalten, damit das eine
    // Entscheidung bleibt und nicht als Versehen durchrutscht.
    it.each(NUR_ADMIN)('lässt den Admin-Befehl /%s bewusst aus der Übersicht', (name) => {
        expect(HELP_TEXT).not.toContain(`/${name}`);
    });

    // Die Ausnahmeliste selbst prüft sonst niemand: ein Tippfehler darin (oder ein inzwischen
    // umbenannter/entfernter Befehl) würde einen echten Befehl NICHT mehr ausnehmen, und der
    // Eintrag stünde als stille Karteileiche da - in BEIDEN abgeleiteten Tests, die sie nutzen.
    it.each(NUR_ADMIN)('nennt mit /%s einen Befehl, den es wirklich gibt', (name) => {
        expect((commands as {data: {name: string}}[]).map(c => c.data.name)).toContain(name);
    });

    // Gruppen-Befehle erklären sich über ihr eigenes `hilfe` - die Übersicht muss darauf verweisen.
    // Ebenfalls abgeleitet: eine neue Gruppe ohne Verweis fällt hier auf.
    it.each(gruppenBefehle())('verweist für die Gruppe /%s auf deren eigenes hilfe', (name) => {
        expect(HELP_TEXT).toContain(`/${name} hilfe`);
    });

    it('bleibt unter dem Discord-Limit von 2000 Zeichen', () => {
        expect(HELP_TEXT.length).toBeLessThanOrEqual(2000);
    });
});

// Die Gruppen-Hilfe ist die EINZIGE Dokumentation der Subcommands (die Übersicht nennt nur die
// wichtigsten). Ein Subcommand, der dort fehlt, ist für Nutzer schlicht unauffindbar - genau das war
// bei `/charakter hilfe` der Fall, das sich selbst nicht auflistete. Der Test geht durch das echte
// execute() der Command-Datei, braucht also keine Kenntnis darüber, welcher Handler dranhängt.
describe('Gruppen-Hilfe deckt alle eigenen Subcommands ab', () => {
    const gruppen = (commands as any[]).filter(c => hatSubcommands(c));

    // Subcommand-Namen inkl. der in Gruppen verschachtelten (z.B. "meilenstein setzen").
    const subcommandNamen = (command: any): string[] =>
        command.data.options.flatMap((option: any) => {
            const json = option.toJSON();
            return json.type === 2
                ? (json.options ?? []).map((sub: any) => sub.name)  // Subcommand-Gruppe
                : [json.name];
        });

    const hilfeText = async (command: any, gruppe: string | null, sub: string): Promise<string> => {
        let antwort = '';
        await command.execute({
            options: {
                getSubcommandGroup: () => gruppe,
                getSubcommand: () => sub,
                getString: () => null,
                getNumber: () => null,
                getUser: () => null,
            },
            reply: (text: unknown) => {
                antwort = typeof text === 'string' ? text : JSON.stringify(text);
                return Promise.resolve();
            },
        });
        return antwort;
    };

    it.each(gruppen.map(c => [c.data.name, c] as const))(
        '/%s hilfe nennt jeden seiner Subcommands',
        async (name, command) => {
            const text = await hilfeText(command, null, 'hilfe');

            expect(text.length).toBeGreaterThan(0);
            for (const sub of subcommandNamen(command)) {
                expect(text, `/${name} ${sub} fehlt in der eigenen Hilfe`).toContain(sub);
            }
        }
    );
});
