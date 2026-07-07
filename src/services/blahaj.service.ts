import redisService from './redis.service.js';

const KEYS = {
    totalEur: 'BLAHAJ:TOTAL_EUR',
};

class BlahajService {
    // Addiert einen erwähnten Euro-Betrag zur laufenden Server-Gesamtsumme und gibt die neue Summe zurück.
    async addEuroAmount(amount: number): Promise<number> {
        return redisService.incrementFloat(KEYS.totalEur, amount);
    }

    async getTotalEur(): Promise<number> {
        const value = await redisService.get(KEYS.totalEur);
        return value ? parseFloat(value) : 0;
    }
}

export default new BlahajService();
