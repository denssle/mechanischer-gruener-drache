export interface EventSubSubscription {
    id: string;
    status: string;
    type: string;
    condition?: {
        broadcaster_user_id?: string;
    };
}