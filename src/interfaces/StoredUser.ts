export interface StoredUser {
    id: string;
    username: string;
    tag: string;
    displayName: string;
    roles: string[];
    joinedAt: string | null;
    saved: number;
}