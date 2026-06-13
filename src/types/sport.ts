export interface SportEntry {
    id: string;
    userId: string;
    activity: string;
    kilometers: number;
    createdAt: string;
}

export const SportActivities = {
    laufen: '🏃 Laufen',
    radfahren: '🚴 Radfahren',
    schwimmen: '🏊 Schwimmen',
    wandern: '🚶 Wandern',
    skifahren: '⛷️ Skifahren',
} as const;

export type SportActivity = keyof typeof SportActivities;
