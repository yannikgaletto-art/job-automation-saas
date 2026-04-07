/**
 * Formats an ISO date string to a locale-aware absolute date.
 * Always absolute — "6. Apr. 2026" not "about 20 hours ago".
 * Locale comes from the browser automatically via toLocaleDateString().
 */
export function formatAppliedDate(isoDate: string): string {
    const date = new Date(isoDate)
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}
