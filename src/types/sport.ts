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

export interface SportMilestone {
    kilometers: number;
    text: string;
    // Einmal erreicht = erreicht: verhindert, dass derselbe Meilenstein erneut feiert,
    // wenn die Gesamtsumme später wieder unter die Schwelle fällt und erneut steigt.
    announced: boolean;
}
