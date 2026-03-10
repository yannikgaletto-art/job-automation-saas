/**
 * CV Template Helpers — shared utilities for PDF template rendering.
 */

/**
 * Truncates education description to max ~120 characters (≈ 2 lines at 9pt).
 * Clean truncation at word boundary, no "..." suffix.
 */
export function truncateDescription(
    text: string | undefined | null,
    maxChars = 120,
): string | undefined {
    if (!text) return undefined;
    if (text.length <= maxChars) return text;
    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
}

/**
 * Infers a numeric proficiency level (1-5) from a text proficiency string.
 * Used when CvStructuredData V1 has proficiency text but no numeric level.
 */
export function inferLanguageLevel(proficiency?: string): number {
    if (!proficiency) return 3;
    const lower = proficiency.toLowerCase();
    if (lower.includes('mutter') || lower === 'c2' || lower.includes('native')) return 5;
    if (lower.includes('fließ') || lower.includes('fluent') || lower === 'c1') return 4;
    if (lower.includes('verhandlungssicher') || lower.includes('advanced')) return 4;
    if (lower === 'b2' || lower.includes('good') || lower.includes('gut')) return 3;
    if (lower === 'b1' || lower === 'a2' || lower.includes('basic') || lower.includes('grund')) return 2;
    if (lower === 'a1') return 1;
    return 3; // safe default
}
