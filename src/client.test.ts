import {describe, it, expect} from 'vitest';
import client, {STANDARD_MENTIONS} from './client.js';

describe('client', () => {
    // Das ist die Versicherung gegen eine vergessene allowedMentions-Angabe.
    it('pingt per Voreinstellung niemanden', () => {
        expect(client.options.allowedMentions).toEqual(STANDARD_MENTIONS);
        expect(STANDARD_MENTIONS.parse).toEqual([]);
    });

    it('lässt Antworten die Person weiter benachrichtigen', () => {
        expect(STANDARD_MENTIONS.repliedUser).toBe(true);
    });
});
