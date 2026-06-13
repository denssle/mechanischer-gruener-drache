import {describe, it, expect} from 'vitest';
import pingPongHandler from "./pingPong.handler.js";

describe('PingPongHandler', () => {
    describe('convertScoreToNumber', () => {
        it('gibt 0 zurück für leeren String', () => {
            expect(pingPongHandler.convertScoreToNumber('')).toBe(0);
        });

        it('gibt 0 zurück für NaN', () => {
            expect(pingPongHandler.convertScoreToNumber('abc')).toBe(0);
        });

        it('konvertiert String zu Number', () => {
            expect(pingPongHandler.convertScoreToNumber('42')).toBe(42);
        });

        it('akzeptiert auch direkte Numbers', () => {
            expect(pingPongHandler.convertScoreToNumber(42)).toBe(42);
        });

        it('gibt 0 zurück für 0', () => {
            expect(pingPongHandler.convertScoreToNumber(0)).toBe(0);
        });
    });

    describe('generatePingPongKey', () => {
        it('kombiniert userId und Key korrekt', () => {
            expect(pingPongHandler.generatePingPongKey('123')).toBe('123PING_PONG');
        });

        it('funktioniert mit verschiedenen UserIds', () => {
            expect(pingPongHandler.generatePingPongKey('abc')).toBe('abcPING_PONG');
        });
    });
});