import {describe, it, expect, vi, beforeEach} from 'vitest';

const redis = vi.hoisted(() => ({
    setHashField: vi.fn(),
    getHashAll: vi.fn(),
    deleteHashField: vi.fn(),
}));
vi.mock('./redis.service.js', () => ({default: redis}));

import rpService from './rp.service.js';

describe('RpService', () => {
    beforeEach(() => {
        redis.setHashField.mockReset();
        redis.getHashAll.mockReset();
        redis.deleteHashField.mockReset();
    });

    it('trägt eine Person mit Art im Hash RP:SUCHENDE ein', async () => {
        await rpService.setSuchend('u1', 'pbp');
        expect(redis.setHashField).toHaveBeenCalledWith('RP:SUCHENDE', 'u1', 'pbp');
    });

    it('entfernt eine Person aus dem Hash', async () => {
        await rpService.entferneSuchend('u1');
        expect(redis.deleteHashField).toHaveBeenCalledWith('RP:SUCHENDE', 'u1');
    });

    it('liest alle Suchenden aus dem Hash', async () => {
        redis.getHashAll.mockResolvedValue({u1: 'pbp', u2: 'beides'});
        expect(await rpService.getSuchende()).toEqual({u1: 'pbp', u2: 'beides'});
        expect(redis.getHashAll).toHaveBeenCalledWith('RP:SUCHENDE');
    });
});
