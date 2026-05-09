/**
 * Pure helpers used by the Initiativ discovery form (Quick-Pick chips + voice locale).
 * Extracted so they can be unit-tested without DOM / next-intl rendering.
 */

export type VoiceLocale = 'de' | 'en' | 'es';

export function localeForVoice(locale: string): VoiceLocale {
    if (locale === 'en') return 'en';
    if (locale === 'es') return 'es';
    return 'de';
}

/**
 * Toggle a token in a comma-separated value.
 *
 * - If `token` already appears (case-insensitive), it is removed.
 * - Otherwise it is appended.
 * - Existing tokens keep their original casing; whitespace is normalised.
 *
 * Examples:
 *   toggleCsvToken('', 'KI')                  → 'KI'
 *   toggleCsvToken('KI', 'Beratung')          → 'KI, Beratung'
 *   toggleCsvToken('KI, Beratung', 'KI')      → 'Beratung'
 *   toggleCsvToken('  ki  , beratung', 'KI')  → 'beratung'
 */
export function toggleCsvToken(current: string, token: string): string {
    const tokens = current.split(',').map((t) => t.trim()).filter(Boolean);
    const lowered = token.toLocaleLowerCase('de-DE');
    const idx = tokens.findIndex((t) => t.toLocaleLowerCase('de-DE') === lowered);
    if (idx >= 0) {
        tokens.splice(idx, 1);
    } else {
        tokens.push(token);
    }
    return tokens.join(', ');
}

/**
 * True iff `token` is present in the comma-separated `current` (case-insensitive).
 */
export function isCsvTokenActive(current: string, token: string): boolean {
    const lowered = token.toLocaleLowerCase('de-DE');
    return current
        .split(',')
        .map((t) => t.trim().toLocaleLowerCase('de-DE'))
        .includes(lowered);
}
