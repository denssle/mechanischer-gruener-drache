import {describe, it, expect} from 'vitest';
import {Collection} from 'discord.js';
import {hatEigeneRolle} from './rollen.service.js';

const mitglied = (...rollen: string[]) =>
    ({roles: {cache: new Collection(rollen.map(id => [id, {id}]))}}) as any;

describe('hatEigeneRolle', () => {
    it('zählt @everyone nicht als Rolle', () => {
        expect(hatEigeneRolle(mitglied('guild-1'), 'guild-1')).toBe(false);
    });

    it('erkennt jede andere Rolle', () => {
        expect(hatEigeneRolle(mitglied('guild-1', 'twitch'), 'guild-1')).toBe(true);
    });
});
