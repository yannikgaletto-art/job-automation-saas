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
    /** JSON-safe variant of restore: escapes control chars in PII values
     *  before injecting into a raw JSON string. Use when restoring tokens
     *  inside JSON that hasn't been parsed yet (e.g. Claude response). */
    restoreJson: (jsonString: string) => string;
    /** PII types found, e.g. ['NAME', 'EMAIL'] — no plaintext PII */
    warningFlags: string[];
    /** Token→original PII mapping (e.g. '__NAME_0__' → 'Max Mustermann').
     *  Exposed for callers that need to extract PII values locally
     *  (e.g. document-processor encrypts PII from tokenMap instead of AI response).
     *  ⚠️ Contains plaintext PII — handle with care, encrypt or discard immediately. */
    tokenMap: Map<string, string>;
}

// ─── Regex Patterns (de/en/es) ──────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /\+?[0-9][\d\s\-/()]{7,19}/g;
const IBAN_REGEX = /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}/g;
// SAFETY NOTE: These /g regexes are module-level constants.
// String.prototype.replace() always resets lastIndex after each call — SAFE for shared use.
// ⚠️ NEVER call .test() or .exec() on these regexes — those retain lastIndex between calls
// and would produce incorrect results on subsequent invocations (concurrency bug).

// Name heuristic: Two consecutive capitalized words (Title Case).
// Supports: hyphenated names (Anna-Lena), accented chars (García, José)
// Guard: Single capitalized words (Berlin, JavaScript) are NOT matched.
// Note: (?<![.!?]\s) prevents matching after sentence-end punctuation
const NAME_REGEX = /(?<![.!?]\s)([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+(?:-[A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+)?)\s+([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+(?:-[A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ][a-záàâäãåæçéèêëíìîïñóòôöõúùûüý]+)?)/gm;

// CAPS name heuristic: Two consecutive ALL-UPPERCASE words (≥2 chars each).
// Common in traditional DE/AT CVs: "MAX MUSTERMANN", "ANNA-LENA SCHMIDT"
// Runs BEFORE NAME_REGEX to catch CAPS variants first.
// SAFETY: Same /g rules apply — only use with .replace(), never .test()/.exec().
const CAPS_NAME_REGEX = /\b([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ]{2,}(?:-[A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ]{2,})?)[ \t]+([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ]{2,}(?:-[A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ]{2,})?)\b/gm;

// ─── FALSE POSITIVE GUARD (comprehensive) ───────────────────────────
// Prevents common CV terms from being falsely detected as names.
// Covers: job titles, section headers, tech terms, company suffixes,
// German/English/Spanish greeting formulas.
const FALSE_POSITIVE_GUARD = new Set([
    // ── Tech terms ──
    'Visual Studio', 'Machine Learning', 'Artificial Intelligence', 'Next App',
    'Type Script', 'Java Script', 'Node Js', 'React Native', 'Vue Js',
    'Deep Learning', 'Data Science', 'Big Data', 'Power Point', 'Power Automate',
    'Google Cloud', 'Amazon Web', 'Web Services', 'Open Source', 'Version Control',
    'Unit Testing', 'Test Driven', 'Design Thinking', 'User Experience',
    'User Interface', 'Front End', 'Back End', 'Full Stack',
    // ── Job titles (2-word, Title Case) ──
    'Senior Manager', 'Senior Consultant', 'Senior Developer', 'Senior Engineer',
    'Senior Analyst', 'Senior Designer', 'Senior Architect', 'Senior Director',
    'Junior Manager', 'Junior Consultant', 'Junior Developer', 'Junior Engineer',
    'Junior Analyst', 'Junior Designer',
    'Project Manager', 'Product Manager', 'Program Manager', 'Account Manager',
    'General Manager', 'Regional Manager', 'Operations Manager', 'Marketing Manager',
    'Software Engineer', 'Software Developer', 'Software Architect',
    'Innovation Manager', 'Innovation Consultant',
    'Business Analyst', 'Business Developer', 'Business Consultant',
    'Data Analyst', 'Data Engineer', 'Data Scientist',
    'Team Lead', 'Team Leader', 'Tech Lead',
    'Managing Director', 'Creative Director', 'Art Director',
    'Chief Executive', 'Chief Technology', 'Chief Operating', 'Chief Financial',
    'Vice President',
    'Working Student', 'Research Assistant', 'Teaching Assistant',
    // ── Company / institution suffixes ──
    'Consulting Group', 'Advisory Group', 'Management Group',
    'Boston Consulting', 'Firma Gmb',
    // ── CV section headers (CAPS — caught by CAPS_NAME_REGEX) ──
    'PERSONAL INFORMATION', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
    'CURRICULUM VITAE', 'CAREER SUMMARY', 'EXECUTIVE SUMMARY',
    'EDUCATION BACKGROUND', 'PROFESSIONAL DEVELOPMENT', 'KEY SKILLS',
    'CORE COMPETENCIES', 'TECHNICAL SKILLS', 'LANGUAGE SKILLS',
    'ADDITIONAL INFORMATION', 'PERSONAL DETAILS', 'CONTACT INFORMATION',
    'PROJECT EXPERIENCE', 'RELEVANT EXPERIENCE', 'ACADEMIC BACKGROUND',
    // ── German section headers (CAPS) ──
    'PERSÖNLICHE DATEN', 'ZUR PERSON', 'ÜBER MICH',
    // ── CAPS job titles (caught by CAPS_NAME_REGEX) ──
    'INNOVATION MANAGER', 'PROJECT MANAGER', 'PRODUCT MANAGER', 'PROGRAM MANAGER',
    'SENIOR MANAGER', 'SENIOR CONSULTANT', 'SENIOR DEVELOPER', 'SENIOR ENGINEER',
    'JUNIOR MANAGER', 'JUNIOR DEVELOPER', 'SOFTWARE ENGINEER', 'SOFTWARE DEVELOPER',
    'DATA ANALYST', 'DATA ENGINEER', 'DATA SCIENTIST', 'BUSINESS ANALYST',
    'TEAM LEAD', 'TEAM LEADER', 'MANAGING DIRECTOR', 'CREATIVE DIRECTOR',
    'VICE PRESIDENT', 'GENERAL MANAGER', 'ACCOUNT MANAGER',
    'MACHINE LEARNING', 'ARTIFICIAL INTELLIGENCE', 'DEEP LEARNING',
    'DESIGN THINKING', 'USER EXPERIENCE', 'FULL STACK',
    // ── German formulas ──
    'Sehr Geehrte', 'Sehr Geehrter', 'Mit Freundlichen', 'Liebe Grüße',
    'Guten Tag', 'Guten Morgen', 'Vielen Dank',
    // ── Spanish formulas ──
    'Muy Estimado', 'Muy Estimada', 'Buenos Días', 'Muchas Gracias',
    // ── English formulas ──
    'Dear Sir', 'Dear Madam', 'Best Regards', 'Kind Regards',
]);

// ─── Core Functions ─────────────────────────────────────────────────

// Words that never START a person's name.
// Used to reject matches like "The Boston", "Bei Siemens", "Von Siemens".
// More scalable than listing every company in FALSE_POSITIVE_GUARD.
const FIRST_WORD_STOPLIST = new Set([
    // English articles & prepositions
    'The', 'THE', 'For', 'FOR', 'And', 'AND', 'With', 'WITH', 'From', 'FROM',
    'About', 'ABOUT', 'After', 'AFTER', 'Under', 'UNDER',
    // German articles & prepositions (as they appear in CVs)
    'Bei', 'BEI', 'Für', 'FÜR', 'Und', 'UND', 'Mit', 'MIT', 'Seit', 'SEIT',
    'Bis', 'BIS', 'Über', 'ÜBER', 'Unter', 'UNTER', 'Durch', 'DURCH',
    'Als', 'ALS', 'Wie', 'WIE',
    // Spanish articles & prepositions
    'Por', 'POR', 'Con', 'CON', 'Para', 'PARA',
    // Business/CV section words that are followed by a city/noun
    'New', 'NEW', 'San', 'SAN', 'Los', 'LOS', 'Las', 'LAS',
    // German institutional prefixes — never a person's first name
    // Prevents "Deutsche Rentenversicherung", "Deutsche Bank", etc. from matching as names
    'Deutsche', 'DEUTSCHE', 'Deutschen', 'DEUTSCHEN',
    'Bundesagentur', 'BUNDESAGENTUR', 'Bundesministerium', 'BUNDESMINISTERIUM',
]);

/**
 * Sanitizes PII in text for safe AI model transfer.
 * Token format: __TYPE_INDEX__ (survives Claude reformulations)
 */
export function sanitizeForAI(input: string): SanitizeResult {
    if (!input || input.trim() === '') {
        return { sanitized: '', restore: (t: string) => t, restoreJson: (t: string) => t, warningFlags: [], tokenMap: new Map() };
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

    // 4a. CAPS Names (BEFORE standard names — catches "MAX MUSTERMANN" patterns)
    result = result.replace(CAPS_NAME_REGEX, (match, first, last) => {
        const fullName = `${first} ${last}`;
        if (FALSE_POSITIVE_GUARD.has(fullName)) return match;
        if (FIRST_WORD_STOPLIST.has(first)) return match;
        const token = `__NAME_${counters.NAME}__`;
        counters.NAME++;
        tokenMap.set(token, match);
        if (!warningFlags.includes('NAME')) warningFlags.push('NAME');
        return token;
    });

    // 4b. Title Case Names (standard heuristic — "Max Mustermann")
    result = result.replace(NAME_REGEX, (match, first, last) => {
        const fullName = `${first} ${last}`;
        if (FALSE_POSITIVE_GUARD.has(fullName)) return match;
        if (FIRST_WORD_STOPLIST.has(first)) return match;
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

    // JSON-safe restore: escapes control characters in PII values
    // so they don't break JSON string literals when injected.
    // Use case: Claude returns JSON with __NAME_0__ tokens, and we
    // replace them with original PII that may contain OCR artifacts.
    const restoreJson = (jsonString: string): string => {
        let restored = jsonString;
        for (const [token, original] of tokenMap.entries()) {
            // JSON-escape: handle chars that break JSON string literals
            const escaped = original
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/[\x00-\x1f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
            restored = restored.split(token).join(escaped);
        }
        return restored;
    };

    return { sanitized: result, restore, restoreJson, warningFlags, tokenMap };
}

/**
 * Builds a SHA256 content hash for audit logging without storing plaintext.
 */
export function buildContentHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}
