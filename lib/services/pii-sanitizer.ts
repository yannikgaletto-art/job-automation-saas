/**
 * PII Sanitizer — DSGVO Phase 2
 * Feature-Silo: standalone utility (no Supabase, no Anthropic)
 *
 * Pseudonymizes PII in text before sending to AI models.
 * Supports: de, en, es (all 3 app languages).
 *
 * DSGVO Art. 25 (Privacy by Design) + Art. 28 (Processor Transfer Minimization)
 */

import crypto from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────

export interface SanitizeResult {
    /** Text with PII replaced by tokens */
    sanitized: string;
    /** Restores tokens back to original PII (exact-string map lookup) */
    restore: (text: string) => string;
    /** PII types found, e.g. ['NAME', 'EMAIL'] — no plaintext PII */
    warningFlags: string[];
}

// ─── Regex Patterns (de/en/es) ──────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /\+?[0-9][\d\s\-/()]{7,19}/g;
const IBAN_REGEX = /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}/g;

// Name heuristic: Two consecutive capitalized words NOT at start of sentence.
// Supports: hyphenated names (Anna-Lena), accented chars (García, José)
// Guard: Single capitalized words (Berlin, JavaScript) are NOT matched.
const NAME_REGEX = /(?<![.!?]\s)(?<!^)([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+(?:-[A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+)?)\s+([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+(?:-[A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+)?)/gm;

// Common words that look like names but aren't (tech terms, cities, companies)
const FALSE_POSITIVE_GUARD = new Set([
    // Tech
    'Visual Studio', 'Machine Learning', 'Artificial Intelligence', 'Next App',
    'Type Script', 'Java Script', 'Node Js', 'React Native', 'Vue Js',
    // German cities / common nouns
    'Sehr Geehrte', 'Sehr Geehrter', 'Mit Freundlichen', 'Liebe Grüße',
    'Guten Tag', 'Guten Morgen', 'Vielen Dank',
    // Spanish
    'Muy Estimado', 'Muy Estimada', 'Buenos Días', 'Muchas Gracias',
    // English
    'Dear Sir', 'Dear Madam', 'Best Regards', 'Kind Regards',
]);

// ─── Core Functions ─────────────────────────────────────────────────

/**
 * Sanitizes PII in text for safe AI model transfer.
 * Token format: __TYPE_INDEX__ (survives Claude reformulations)
 */
export function sanitizeForAI(input: string): SanitizeResult {
    if (!input || input.trim() === '') {
        return { sanitized: '', restore: (t: string) => t, warningFlags: [] };
    }

    const tokenMap = new Map<string, string>(); // token → original
    const warningFlags: string[] = [];
    let result = input;
    let counters = { NAME: 0, EMAIL: 0, PHONE: 0, IBAN: 0 };

    // Order matters: emails first (contain dots that phone regex might grab)

    // 1. Emails
    result = result.replace(EMAIL_REGEX, (match) => {
        const token = `__EMAIL_${counters.EMAIL}__`;
        counters.EMAIL++;
        tokenMap.set(token, match);
        if (!warningFlags.includes('EMAIL')) warningFlags.push('EMAIL');
        return token;
    });

    // 2. IBANs (before phones — IBAN contains numbers)
    result = result.replace(IBAN_REGEX, (match) => {
        const token = `__IBAN_${counters.IBAN}__`;
        counters.IBAN++;
        tokenMap.set(token, match);
        if (!warningFlags.includes('IBAN')) warningFlags.push('IBAN');
        return token;
    });

    // 3. Phone numbers
    result = result.replace(PHONE_REGEX, (match) => {
        // German phone numbers have ≥10 digits. Year ranges (2020-2023 = 8 digits)
        // and short codes are excluded by this threshold.
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length < 10) return match;
        const token = `__PHONE_${counters.PHONE}__`;
        counters.PHONE++;
        tokenMap.set(token, match);
        if (!warningFlags.includes('PHONE')) warningFlags.push('PHONE');
        return token;
    });

    // 4. Names (heuristic — last, most likely to false-positive)
    result = result.replace(NAME_REGEX, (match, first, last) => {
        const fullName = `${first} ${last}`;
        if (FALSE_POSITIVE_GUARD.has(fullName)) return match;
        const token = `__NAME_${counters.NAME}__`;
        counters.NAME++;
        tokenMap.set(token, match);
        if (!warningFlags.includes('NAME')) warningFlags.push('NAME');
        return token;
    });

    // Build restore function (exact-string map lookup, NOT regex)
    const restore = (text: string): string => {
        let restored = text;
        for (const [token, original] of tokenMap.entries()) {
            // Use split+join for exact-string replacement (no regex special chars)
            restored = restored.split(token).join(original);
        }
        return restored;
    };

    return { sanitized: result, restore, warningFlags };
}

/**
 * Builds a SHA256 content hash for audit logging without storing plaintext.
 */
export function buildContentHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}
