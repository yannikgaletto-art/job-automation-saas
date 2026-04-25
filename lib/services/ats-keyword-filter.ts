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
