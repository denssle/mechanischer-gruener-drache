export interface SportEntry {
    id: string;
    userId: string;
    activity: string;
    kilometers: number;
    minutes?: number;
    createdAt: string;
}

export const SportActivities = {
    laufen: '🏃 Laufen',
    radfahren: '🚴 Radfahren',
    schwimmen: '🏊 Schwimmen',
    wandern: '🚶 Wandern',
    skifahren: '⛷️ Skifahren',
    krafttraining: '💪 Krafttraining',
} as const;

export type SportActivity = keyof typeof SportActivities;

export interface ErkannteSportLeistung {
    aktivitaet: SportActivity;
    kilometer?: number;
    minuten?: number;
}

export const AKTIVITAET_EINHEIT: Record<SportActivity, 'km' | 'min'> = {
    laufen: 'km',
    radfahren: 'km',
    schwimmen: 'km',
    wandern: 'km',
    skifahren: 'km',
    krafttraining: 'min',
};

export function istDistanzAktivitaet(aktivitaet: SportActivity): boolean {
    return AKTIVITAET_EINHEIT[aktivitaet] === 'km';
}

export function istMinutenAktivitaet(aktivitaet: SportActivity): boolean {
    return AKTIVITAET_EINHEIT[aktivitaet] === 'min';
}

export interface SportMilestone {
    kilometers: number;
    text: string;
    // Einmal erreicht = erreicht: verhindert, dass derselbe Meilenstein erneut feiert,
    // wenn die Gesamtsumme später wieder unter die Schwelle fällt und erneut steigt.
    announced: boolean;
}
