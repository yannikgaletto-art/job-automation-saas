/**
 * ats-keyword-filter.ts — Pipeline-side stop-list for ATS keywords.
 *
 * Purpose: Filter garbage out of `ats_keywords` extracted by the Harvester
 * (Claude Haiku) BEFORE the keywords are persisted to job_queue.buzzwords.
 *
 * Replaces the previous UI-side `LOW_SIGNAL` filter in
 * app/[locale]/dashboard/components/job-row.tsx (16 stop-words, only handled
 * conjunctions) — moved here so all downstream consumers (CV-Match,
 * CV-Optimizer, Job-Queue UI) work with the cleaned set.
 *
 * Stop-list categories (4):
 *   1. Soft-skill-Floskeln (Teamfähigkeit, Eigenverantwortung)
 *   2. Benefits / Arbeitsbedingungen (Bürozeit, Homeoffice, Bonus)
 *   3. Generic adjectives (dynamisch, innovativ, modern)
 *   4. Filler phrases (Wir bieten, Du bringst mit)
 *
 * Definition source: docs/CTO_ANALYSIS_STECKBRIEF (2026-04-25).
 */

// Source: docs/ATS_Keywords.docs.pdf — Sektion 9 "Generische Soft-Skill-Floskeln"
const STOP_LIST_SOFT_SKILLS = [
    // German — generic soft skills (NEVER ATS filter terms; see Sektion 9)
    'teamfähigkeit', 'eigenverantwortung', 'eigenverantwortlich',
    'eigeninitiative', 'kommunikationsstärke', 'kommunikationsfähigkeit',
    'belastbarkeit', 'flexibilität', 'zuverlässigkeit', 'sorgfalt',
    'engagement', 'einsatzbereitschaft', 'leistungsbereitschaft',
    'lernbereitschaft', 'motivation',
    'durchsetzungsvermögen', 'durchsetzungsstärke', 'serviceorientierung',
    'kundenorientierung', 'lösungsorientierung', 'qualitätsbewusstsein',
    'verantwortungsbewusstsein', 'verantwortungsbewusst',
    'organisationstalent', 'organisationsfähigkeit',
    'analytisches denken', 'analytische fähigkeiten',
    'kreativität', 'empathie',
    'selbstständigkeit', 'selbständigkeit', 'proaktivität',
    'hands-on-mentalität', 'hands on mentalität', 'hands-on mentalität',
    'detailverliebt', 'neugier', 'offenheit',
    'ergebnisorientiert', 'ergebnisorientierung',
    // English — generic soft skills
    'teamwork', 'team player', 'communication skills', 'reliability',
    'flexibility', 'commitment', 'initiative', 'creativity',
    'attention to detail', 'detail oriented', 'detail-oriented',
    'work ethic', 'positive attitude',
    'self-motivated', 'self motivated', 'self-starter', 'self starter',
    'problem solving', 'problem-solving',
    'results-driven', 'results driven',
    'passionate', 'driven', 'motivated',
    'fast learner', 'quick learner',
];

// Source: docs/ATS_Keywords.docs.pdf — Sektion 9 "Benefits & Rahmenbedingungen"
const STOP_LIST_BENEFITS = [
    // Work conditions
    'bürozeit', 'kernarbeitszeit', 'gleitzeit', 'flexible arbeitszeit',
    'flexible arbeitszeiten', 'arbeitszeit', 'arbeitszeiten',
    'homeoffice', 'home office', 'home-office', 'mobiles arbeiten',
    'remote work', 'hybrid work', 'workation', 'sabbatical',
    'urlaubstage', '30 urlaubstage', 'urlaub', 'jahresurlaub',
    'unbefristet', 'vollzeit', 'teilzeit',
    // Compensation
    'bonus', 'jahresbonus', 'prämie', 'tantieme',
    'gehalt', 'vergütung', 'lohn', 'überstunden',
    'attraktive vergütung', 'leistungsgerechte vergütung',
    'unbefristeter vertrag', 'unbefristete anstellung', 'festanstellung',
    // Perks
    'jobticket', 'deutschlandticket', 'jobrad', 'firmenwagen',
    'kantine', 'obstkorb', 'kaffee', 'getränke',
    'altersvorsorge', 'betriebliche altersvorsorge', 'bav',
    'fitnessstudio', 'gesundheitsförderung', 'mitarbeiterrabatte',
    'corporate benefits', 'team events', 'firmenevents',
    'weiterbildung', 'fortbildung', 'schulungen',
    // English perks
    'health insurance', 'pension', 'company car', 'gym membership',
    'paid time off', 'pto', 'parental leave', 'free lunch',
    'stock options', 'equity', 'rsu',
    'full-time', 'full time', 'part-time', 'part time', 'permanent',
];

// Source: docs/ATS_Keywords.docs.pdf — Sektion 9 "Bedeutungslose Adjektive"
const STOP_LIST_GENERIC_ADJECTIVES = [
    // German — adjectives without skill content
    'dynamisch', 'innovativ', 'innovativ als adjektiv',
    'modern', 'agil', // Sektion 9: "Agil (als Adjektiv)" — methode "Agile" bleibt valide
    'engagiert', 'motiviert',
    'erfahren', 'qualifiziert', 'kompetent', 'professionell',
    'zuverlässig', 'kreativ', 'offen', 'freundlich', 'sympathisch',
    'erfolgreich', 'wachsend', 'führend', 'international',
    'spannend', 'abwechslungsreich', 'vielseitig', 'anspruchsvoll',
    'herausfordernd', 'verantwortungsvoll',
    'zukunftsorientiert', 'namhaft', 'renommiert',
    // English
    'dynamic', 'innovative', 'modern', 'engaged',
    'experienced', 'qualified', 'competent', 'professional',
    'reliable', 'creative', 'successful', 'leading', 'international',
    'exciting', 'challenging', 'rewarding',
];

// Source: docs/ATS_Keywords.docs.pdf — Sektion 9 "Phrasen / Satzfragmente" + "Überholte Tech-Terme"
const STOP_LIST_FILLER_PHRASES = [
    // German — filler phrases (PDF Sektion 9)
    'du bringst mit', 'sie bringen mit', 'wir bieten', 'wir bieten dir',
    'wir bieten ihnen', 'wir suchen', 'werde teil', 'werden sie teil',
    'werde teil unseres teams', 'werden sie teil unseres teams',
    'das bringen sie mit', 'das bringst du mit',
    'was wir bieten', 'das erwartet dich', 'das erwartet sie',
    'deine aufgaben', 'ihre aufgaben', 'dein profil', 'ihr profil',
    'unser angebot', 'über uns', 'über das unternehmen',
    'ab sofort', 'zum nächstmöglichen zeitpunkt', 'zum nächstmöglichen termin',
    // Conjunctions / fillers (formerly LOW_SIGNAL)
    'und', 'oder', 'bzw', 'bzw.', 'etc', 'etc.', 'usw', 'usw.',
    'diverse', 'sonstige', 'sonstiges', 'allgemein', 'allgemeines',
    'gut', 'gute', 'guter', 'gutes', 'sehr gut',
    // English
    'you bring', 'we offer', 'we provide', 'about us', 'your tasks',
    'your responsibilities', 'we are looking for', 'about the role',
    'and', 'or', 'various', 'general', 'good', 'other', 'misc',
    'about company', 'company description',
    // Spanish
    'y', 'o', 'varios', 'general', 'bueno', 'otros',
];

// Source: docs/ATS_Keywords.docs.pdf — Sektion 9 "Überholte / zu generische Tech-Terme"
// These terms are too generic for modern ATS; PDF prescribes specific replacements
// (e.g. "MS Office Suite" → use "Excel" / "Word" / "PowerPoint" instead).
const STOP_LIST_OUTDATED_TECH = [
    'ms office', 'ms office suite', 'ms-office', 'microsoft office suite',
    'office paket', 'office-paket',
    'social media', 'web 2.0', 'web2.0',
    'internet-kenntnisse', 'internetkenntnisse', 'internet kenntnisse',
    'edv-kenntnisse', 'edvkenntnisse', 'edv kenntnisse',
    'pc-kenntnisse', 'pc kenntnisse',
    'computerkenntnisse', 'computer-kenntnisse',
];

/**
 * Combined stop-list (lowercased, deduplicated).
 * Exported as `Set` for O(1) lookup in hot paths.
 */
export const ATS_STOP_LIST: ReadonlySet<string> = new Set([
    ...STOP_LIST_SOFT_SKILLS,
    ...STOP_LIST_BENEFITS,
    ...STOP_LIST_GENERIC_ADJECTIVES,
    ...STOP_LIST_FILLER_PHRASES,
    ...STOP_LIST_OUTDATED_TECH,
].map(s => s.toLowerCase().trim()));

/**
 * Adjektiv-Prefixes that turn a soft-skill stop-word into a leakable phrase.
 * Example: "Hohe Flexibilität" leaks because "flexibilität" alone is single-word
 * stop, and substring-match only fires for multi-word stop-entries.
 *
 * Source: Investigate report 2026-04-25 — Leak #1.
 */
const ADJEKTIV_PREFIX_PATTERN = /^(hohe|hohes|hoher|hohen|ausgeprägte|ausgeprägter|ausgeprägtes|ausgeprägten|starke|starkes|starker|starken|sehr\s+gute|sehr\s+gutes|sehr\s+guter|sehr\s+guten|hervorragende|hervorragendes|hervorragender|hervorragenden|gute|gutes|guter|guten|großes|große|großer|sehr\s+hohe|sehr\s+hohes|außergewöhnliche|außergewöhnlicher|außergewöhnliches)\s+(.+)$/i;

/**
 * Suffixes used to build German job-related compounds. Stripping them yields
 * the indexable core term (PDF Sektion 10): "Projektleitungserfahrung" → "Projektleitung".
 *
 * Each suffix is listed both with and without the German "Fugen-S" (linking-S)
 * because compounds like "Projektleitungs-erfahrung" use "s" as joiner.
 * Order matters: longer suffixes first so "skenntnisse" beats "kenntnisse".
 *
 * Source: Investigate report 2026-04-25 — Leak #2.
 */
const KOMPOSITUM_SUFFIXES = [
    // With Fugen-S (must come first — longer match wins)
    'skenntnisse', 'serfahrungen', 'serfahrung', 'skompetenzen', 'skompetenz',
    'sfähigkeiten', 'sfähigkeit', 'sexpertise', 'sverständnis',
    // Without Fugen-S
    'kenntnisse', 'erfahrungen', 'erfahrung', 'kompetenzen', 'kompetenz',
    'fähigkeiten', 'expertise', 'verständnis',
];

/**
 * Strip German compound suffixes to expose the indexable core.
 * Returns the original term if no suffix matches or if the core would be too short.
 */
function stripKompositumSuffix(term: string): string {
    const lower = term.toLowerCase();
    for (const suffix of KOMPOSITUM_SUFFIXES) {
        if (lower.endsWith(suffix) && lower.length > suffix.length + 3) {
            const coreLength = term.length - suffix.length;
            // Preserve original casing on the core
            const core = term.slice(0, coreLength);
            // Capitalize first letter to keep ATS-style formatting
            return core.charAt(0).toUpperCase() + core.slice(1);
        }
    }
    return term;
}

export interface FilterResult {
    kept: string[];
    removed: string[];
    /** Terms that were rewritten via Kompositum-stripping. Logged for transparency. */
    rewritten?: Array<{ from: string; to: string }>;
}

/**
 * Filter a list of ATS keyword candidates against the stop-list.
 *
 * Rules:
 *   - Lowercase normalization for comparison; original casing preserved on `kept`.
 *   - Length guard: keywords < 2 chars dropped (noise from JSON parsing).
 *   - Length guard: keywords > 60 chars dropped (whole-sentence leakage from Haiku).
 *   - Word-count guard: > 5 words dropped (definition: max 3 words, lenient = 5).
 *   - Numbers-only entries dropped ("100", "30").
 *   - Kompositum-suffix stripping (Leak #2): "Projektleitungserfahrung" → "Projektleitung".
 *   - Adjektiv-prefix detection (Leak #1): "Hohe Flexibilität" → core "flexibilität" → blocked.
 *   - Exact-match against stop-list (lowercased) on the (stripped, prefix-cleaned) core.
 *   - Substring-match for multi-word filler phrases (e.g. "wir bieten dir").
 *   - Duplicate removal (case-insensitive).
 */
export function filterAtsKeywords(candidates: string[] | null | undefined): FilterResult {
    if (!candidates || candidates.length === 0) {
        return { kept: [], removed: [] };
    }

    const kept: string[] = [];
    const removed: string[] = [];
    const rewritten: Array<{ from: string; to: string }> = [];
    const seenLower = new Set<string>();

    for (const raw of candidates) {
        if (typeof raw !== 'string') {
            removed.push(String(raw));
            continue;
        }

        const original = raw.trim();
        let trimmed = original;

        // Length guards (run on raw input)
        if (trimmed.length < 2 || trimmed.length > 60) {
            removed.push(trimmed);
            continue;
        }

        // Word-count guard (max 5 words, lenient over the 3-word prompt rule)
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount > 5) {
            removed.push(trimmed);
            continue;
        }

        // Numbers-only or punctuation-only
        if (/^[\d\s\-.,]+$/.test(trimmed)) {
            removed.push(trimmed);
            continue;
        }

        // STEP 1 — Stop-list check on ORIGINAL trimmed (before stripping).
        // Catches outdated tech terms like "EDV-Kenntnisse" that would otherwise
        // be partially stripped by the Kompositum-stripper.
        if (ATS_STOP_LIST.has(trimmed.toLowerCase())) {
            removed.push(original);
            continue;
        }

        // STEP 2 — Leak #2 Fix: Kompositum-Suffix-Stripping (PDF Sektion 10).
        // "Projektleitungserfahrung" → "Projektleitung", "Buchhaltungskenntnisse" → "Buchhaltung"
        const stripped = stripKompositumSuffix(trimmed);
        if (stripped !== trimmed) {
            rewritten.push({ from: trimmed, to: stripped });
            trimmed = stripped;
        }

        const lower = trimmed.toLowerCase();

        // STEP 3 — Duplicate check (case-insensitive) on stripped form.
        // "Projektleitung" + "Projektleitungserfahrung" → dedupe to one.
        if (seenLower.has(lower)) {
            removed.push(original);
            continue;
        }

        // STEP 4 — Stop-list check on stripped form (in case stripping yielded a stop-word).
        if (ATS_STOP_LIST.has(lower)) {
            removed.push(original);
            continue;
        }

        // STEP 5 — Leak #1 Fix: Adjektiv-Prefix detection.
        // "Hohe Flexibilität" → core "flexibilität" → check stop-list on core.
        const prefixMatch = trimmed.match(ADJEKTIV_PREFIX_PATTERN);
        if (prefixMatch) {
            const core = prefixMatch[2].trim().toLowerCase();
            if (ATS_STOP_LIST.has(core)) {
                removed.push(original);
                continue;
            }
        }

        // STEP 6 — Substring match for multi-word filler phrases.
        // Only triggers when stop-entry is multi-word — prevents "Salesforce" being
        // killed because "force" is in some hypothetical stop-entry.
        let blockedBySubstring = false;
        for (const stopEntry of ATS_STOP_LIST) {
            if (!stopEntry.includes(' ')) continue;
            if (lower.includes(stopEntry)) {
                blockedBySubstring = true;
                break;
            }
        }
        if (blockedBySubstring) {
            removed.push(original);
            continue;
        }

        seenLower.add(lower);
        kept.push(trimmed); // preserve casing on (possibly-rewritten) core
    }

    const result: FilterResult = { kept, removed };
    if (rewritten.length > 0) result.rewritten = rewritten;
    return result;
}

// ─── Surgical Hallucination Filter (Defense-in-Depth, Cross-Locale-safe) ────
//
// CONTEXT
// The Mistral/Haiku ATS-extraction prompt instructs the LLM to only emit keywords
// that appear in the JD text. Empirical evidence (2026-04-26 SAP-Job test) shows
// that Mistral persistently halluzinates a small set of well-known compliance
// terms ("DSGVO", "ISO 27001", "PCI DSS", "Cloud Computing") even when they are
// absent from the JD — these are training-data favorites.
//
// PRIOR APPROACH (Phase-3 v1, reverted 2026-04-26)
// A blanket verbatim-match filter that tested EVERY keyword against the JD text.
// This worked against compliance hallucinations BUT broke Cross-Locale UX:
// when Mistral correctly translated "physician relations" → "Arztbeziehungen"
// for a German-locale user reading an English JD, the German translation was
// not literally present in the English JD — and the filter dropped it.
// Result: legitimate translations were thrown out as "hallucinations".
//
// CURRENT APPROACH (Phase-3 v2, surgical)
// Verify ONLY keywords on a curated `KNOWN_HALLUCINATIONS` allowlist. All other
// keywords pass through untouched. Compliance hallucinations are still caught;
// cross-locale translations are no longer falsely rejected.
//
// VERIFICATION STRATEGY (only for known-hallucination candidates)
//   1. Normalize keyword + JD (lowercase, strip diacritics, normalize whitespace)
//   2. Try exact phrase match
//   3. Try hyphen-stripped variant ("Stakeholder-Management" ↔ "Stakeholdermanagement")
//   4. Token-level check: every significant token must appear in JD.
//      Long tokens (≥4 chars): prefix-stem match (handles German declension —
//        "Sektor" matches "Sektors", "Öffentlicher" matches "öffentlichen")
//      Short tokens (<4 chars): word-boundary match (prevents "ISO" matching "Position")
//
// MAINTENANCE
// Add new entries to `KNOWN_HALLUCINATIONS` when empirical evidence shows Mistral
// repeatedly halluzinating a specific term. Keep the list short and high-signal —
// every entry is a potential false-reject for users whose JDs actually mention
// the term.

/**
 * Curated set of LLM training-data favorites that Mistral persistently halluzinates.
 * Each entry is verified against the JD before being kept.
 *
 * NORMALIZATION CONTRACT: entries are stored already lowercased + diacritic-stripped
 * (NFKD), so they can be matched directly against `normalizeForComparison(keyword)`.
 */
const KNOWN_HALLUCINATIONS: ReadonlySet<string> = new Set([
    // Compliance / data-protection (cross-locale variants)
    'dsgvo', 'gdpr', 'rgpd',
    'datenschutz-grundverordnung', 'datenschutzgrundverordnung',
    // ISO standards (commonly halluzinated in B2B/consulting JDs)
    'iso 27001', 'iso27001', 'iso-27001',
    'iso 9001', 'iso9001', 'iso-9001',
    'iso 26262', 'iso26262', 'iso-26262',
    'iso 14001', 'iso14001', 'iso-14001',
    'iso 13485', 'iso13485', 'iso-13485',
    'iso 45001', 'iso45001', 'iso-45001',
    // Payment-card & SOC standards
    'pci dss', 'pci-dss', 'pcidss',
    'soc 2', 'soc-2', 'soc2',
    'soc 1', 'soc-1', 'soc1',
    // Generic IT-domain hallucinations (vague, often fabricated)
    'cloud computing',
]);

const STOP_TOKENS_FOR_VERIFICATION: ReadonlySet<string> = new Set([
    'and', 'or', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'as', 'by', 'with',
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'mit', 'auf', 'für', 'bei',
    'y', 'o', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'en', 'con',
]);

function normalizeForComparison(s: string): string {
    return (s ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')      // strip combining diacritics (umlauts → base letter)
        .replace(/[^a-z0-9\s\-_]/g, ' ')      // strip punctuation/special chars
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isTokenInJD(token: string, normalizedJD: string): boolean {
    if (!token) return false;
    if (token.length < 3) {
        // Very short tokens (1-2 chars) — too noisy, ignore them
        return true;
    }
    if (token.length === 3) {
        // 3-char tokens like "SAP", "ERP", "OKR", "CEO" → require word-boundary match
        // to prevent false positives like "iso" matching "position"
        const regex = new RegExp(`\\b${escapeRegex(token)}\\b`);
        return regex.test(normalizedJD);
    }
    // Longer tokens (≥4 chars) → prefix-stem match (handles German declension).
    // Stem length 6 chars is a compromise: short enough for "Sektor"→"Sektors"
    // but long enough to reject false matches.
    const stemLen = Math.min(token.length, 6);
    const stem = token.slice(0, stemLen);
    const regex = new RegExp(`\\b${escapeRegex(stem)}`);
    return regex.test(normalizedJD);
}

/**
 * Internal: verify a single keyword's presence in the (already normalized) JD.
 * Used only for keywords on the KNOWN_HALLUCINATIONS allowlist.
 */
function isKeywordSubstantiated(
    normalizedKw: string,
    normalizedJD: string,
    jdNoSeparators: string,
): boolean {
    // Check 1: Exact phrase match
    if (normalizedKw.length > 0 && normalizedJD.includes(normalizedKw)) {
        return true;
    }

    // Check 2: Hyphen/space-stripped variant
    // "Stakeholder-Management" ↔ "Stakeholder Management" ↔ "Stakeholdermanagement"
    const kwNoSeparators = normalizedKw.replace(/[-_\s]+/g, '');
    if (kwNoSeparators.length >= 4 && jdNoSeparators.includes(kwNoSeparators)) {
        return true;
    }

    // Check 3: Token-level verification — ALL significant tokens must be present
    const tokens = normalizedKw
        .split(/[\s\-_]+/)
        .filter(t => t.length >= 3 && !STOP_TOKENS_FOR_VERIFICATION.has(t));

    if (tokens.length === 0) {
        // Pure short-token keyword like "AI" or "BI" — keep only if word-boundary match
        const allTokens = normalizedKw.split(/[\s\-_]+/).filter(t => t.length >= 2);
        return allTokens.length > 0 && allTokens.every(t => isTokenInJD(t, normalizedJD));
    }

    return tokens.every(t => isTokenInJD(t, normalizedJD));
}

/**
 * Surgical hallucination filter. Verifies only keywords that match the curated
 * KNOWN_HALLUCINATIONS allowlist. All other keywords pass through unchanged,
 * preserving cross-locale translations like "Arztbeziehungen" for "physician
 * relations" that would otherwise be falsely rejected as not-in-JD.
 *
 * If the JD text is missing or too short (< 50 chars), all keywords are kept
 * (no false rejection when verification context is absent).
 *
 * NAME RETAINED for backward compatibility with 5 existing call-sites; semantics
 * are now allowlist-based, NOT blanket verbatim-match.
 */
export function filterByVerbatimJDPresence(
    keywords: string[] | null | undefined,
    jdText: string | null | undefined,
): FilterResult {
    if (!keywords || keywords.length === 0) {
        return { kept: [], removed: [] };
    }
    // Without a reliable JD, we cannot verify — keep all to avoid false rejects
    if (!jdText || jdText.length < 50) {
        return { kept: [...keywords], removed: [] };
    }

    const normalizedJD = normalizeForComparison(jdText);
    const jdNoSeparators = normalizedJD.replace(/[-_\s]+/g, '');

    const kept: string[] = [];
    const removed: string[] = [];

    for (const kw of keywords) {
        if (typeof kw !== 'string' || !kw.trim()) {
            removed.push(String(kw));
            continue;
        }

        const normalizedKw = normalizeForComparison(kw);

        // Pass-through path: keyword is NOT a known LLM-hallucination favorite.
        // We trust the harvester output (preserves cross-locale translations).
        if (!KNOWN_HALLUCINATIONS.has(normalizedKw)) {
            kept.push(kw);
            continue;
        }

        // Verification path: keyword IS a known hallucination → must be substantiated.
        if (isKeywordSubstantiated(normalizedKw, normalizedJD, jdNoSeparators)) {
            kept.push(kw);
        } else {
            removed.push(kw);
        }
    }

    return { kept, removed };
}

/**
 * Read-only export of the hallucination allowlist for tests and audits.
 * Each entry is already lowercased + diacritic-stripped.
 */
export { KNOWN_HALLUCINATIONS };
