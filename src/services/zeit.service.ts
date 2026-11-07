// Lokales Datum als YYYY-MM-DD: der Tagesmarker aller täglichen Aufgaben (Sport, Anstupser, Geburtstag,
// Morgengruß). Bewusst lokale Zeit (Host = Europe/Berlin) statt toISOString: UTC fiele um Mitternacht
// auf den falschen Tag.
export function formatTag(date: Date): string {
    const jahr = date.getFullYear();
    const monat = String(date.getMonth() + 1).padStart(2, '0');
    const tag = String(date.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
}
