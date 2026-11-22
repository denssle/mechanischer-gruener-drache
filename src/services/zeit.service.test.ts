import {describe, it, expect} from 'vitest';
import {formatTag, tagesbeginn} from './zeit.service.js';

describe('formatTag', () => {
    it('baut ein lokales YYYY-MM-DD mit führenden Nullen', () => {
        expect(formatTag(new Date(2026, 0, 5, 13, 37))).toBe('2026-01-05');
    });

    // Mit toISOString läge das in UTC noch auf dem Vortag.
    it('bleibt kurz nach Mitternacht auf dem lokalen Tag', () => {
        expect(formatTag(new Date(2026, 11, 31, 0, 5))).toBe('2026-12-31');
    });
});

describe('tagesbeginn', () => {
    it('liefert die lokale Mitternacht des Tages', () => {
        expect(tagesbeginn('2026-03-09')).toEqual(new Date(2026, 2, 9));
    });

    it('ist das Gegenstück zu formatTag', () => {
        expect(formatTag(tagesbeginn('2026-12-31'))).toBe('2026-12-31');
    });
});
