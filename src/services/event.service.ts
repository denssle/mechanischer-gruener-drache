import redisService from './redis.service.js';
import {CommunityEvent} from '../types/communityEvent.js';

const KEYS = {
    event: 'EVENT:NEXT',
};

class EventService {
    async setEvent(timestamp: number, title: string): Promise<void> {
        const event: CommunityEvent = {timestamp, title};
        await redisService.set(KEYS.event, JSON.stringify(event));
    }

    async getEvent(): Promise<CommunityEvent | null> {
        const data = await redisService.get(KEYS.event);
        if (!data) return null;
        return JSON.parse(data) as CommunityEvent;
    }

    async clearEvent(): Promise<void> {
        await redisService.delete(KEYS.event);
    }
}

export default new EventService();
