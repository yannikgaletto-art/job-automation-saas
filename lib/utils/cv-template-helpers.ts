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

/**
 * Strips US-style GPA conversions from a grade string.
 * The translator and parser sometimes append "(approx. GPA 3.7)" or similar to
 * a German "1.3" — irrelevant for German recruiters and looks unprofessional.
 *
 * Patterns covered:
 *   "1.3 (approx. GPA 3.7)"        → "1.3"
 *   "1,3 (GPA 3.7)"                → "1,3"
 *   "1.3 (approximately 3.7 GPA)"  → "1.3"
 *   "Sehr gut (1,3)"               → "Sehr gut (1,3)"  (untouched — no GPA marker)
 */
export function cleanGrade(grade: string | undefined | null): string {
    if (!grade) return '';
    return grade
        .replace(/\s*\(\s*(?:approx\.?|approximately)?\s*GPA[^)]*\)/gi, '')
        .replace(/\s*\(\s*(?:approx\.?|approximately)\s*[\d.,]+\s*GPA\s*\)/gi, '')
        .trim();
}

/**
 * Normalizes dateRangeText to replace language-specific "present" indicators
 * with the locale-appropriate label.
 *
 * cv-parser stores dates verbatim from the uploaded CV (e.g. "Heute" from a German CV).
 * This display-level normalization ensures consistency regardless of CV language.
 *
 * Examples:
 *   "09.2025 - Heute"   + labelPresent="Present"  → "09.2025 - Present"
 *   "2022 - heute"      + labelPresent="Heute"     → "2022 - Heute"  (de: same word)
 *   "01/2023 - Present" + labelPresent="Hoy"       → "01/2023 - Hoy"  (es: replace)
 */
export function normalizeDateRangeText(
    dateRangeText: string | undefined | null,
    labelPresent: string,
): string {
    if (!dateRangeText) return '';
    // Match any known "present" synonym, case-insensitive
    return dateRangeText.replace(
        /\b(Heute|heute|Present|present|Hoy|hoy|Aktuell|aktuell|current|laufend|Today|today)\b/g,
        labelPresent,
    );
}

