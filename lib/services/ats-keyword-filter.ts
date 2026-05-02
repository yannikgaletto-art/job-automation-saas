/**
 * Central ATS keyword hygiene for Pathly.
 *
 * All job extraction paths must call `cleanAtsKeywords()` before persisting
 * `job_queue.buzzwords`. Prompts should use `buildAtsKeywordPrompt()` so the
 * Browser Extension, Job Search, manual Add Job and Inngest extraction cannot
 * drift into different keyword definitions.
 */

export interface FilterResult {
    kept: string[];
    removed: string[];
    rewritten?: Array<{ from: string; to: string }>;
}

export interface AtsKeywordCleanResult extends FilterResult {
    stopListRemoved: string[];
    hallucinationRemoved: string[];
}

const STOP_LIST_SOFT_SKILLS = [
    'teamfähigkeit', 'eigenverantwortung', 'eigenverantwortlich',
    'eigeninitiative', 'kommunikationsstärke', 'kommunikationsfähigkeit',
    'belastbarkeit', 'flexibilität', 'zuverlässigkeit', 'sorgfalt',
    'engagement', 'einsatzbereitschaft', 'leistungsbereitschaft',
    'lernbereitschaft', 'motivation', 'durchsetzungsvermögen',
    'durchsetzungsstärke', 'serviceorientierung', 'kundenorientierung',
    'lösungsorientierung', 'qualitätsbewusstsein',
    'verantwortungsbewusstsein', 'verantwortungsbewusst',
    'organisationstalent', 'organisationsfähigkeit',
    'analytisches denken', 'analytische fähigkeiten',
    'kreativität', 'empathie', 'selbstständigkeit', 'selbständigkeit',
    'proaktivität', 'hands-on-mentalität', 'hands on mentalität',
    'detailverliebt', 'neugier', 'offenheit', 'ergebnisorientiert',
    'ergebnisorientierung', 'teamwork', 'team player',
    'communication skills', 'reliability', 'flexibility', 'commitment',
    'initiative', 'creativity', 'attention to detail', 'detail oriented',
    'detail-oriented', 'work ethic', 'positive attitude', 'self-motivated',
    'self motivated', 'self-starter', 'self starter', 'problem solving',
    'problem-solving', 'results-driven', 'results driven', 'passionate',
    'driven', 'motivated', 'fast learner', 'quick learner',
];

const STOP_LIST_BENEFITS = [
    'bürozeit', 'kernarbeitszeit', 'gleitzeit', 'flexible arbeitszeit',
    'flexible arbeitszeiten', 'arbeitszeit', 'arbeitszeiten',
    'homeoffice', 'home office', 'home-office', 'mobiles arbeiten',
    'remote work', 'hybrid work', 'hybridarbeit', 'hybrides arbeiten',
    'workation', 'sabbatical', 'urlaubstage', '30 urlaubstage',
    'urlaub', 'jahresurlaub', 'unbefristet', 'vollzeit', 'teilzeit',
    'bonus', 'jahresbonus', 'prämie', 'tantieme', 'gehalt',
    'vergütung', 'lohn', 'überstunden', 'attraktive vergütung',
    'leistungsgerechte vergütung', 'unbefristeter vertrag',
    'unbefristete anstellung', 'festanstellung', 'jobticket',
    'deutschlandticket', 'jobrad', 'firmenwagen', 'kantine',
    'obstkorb', 'kaffee', 'getränke', 'altersvorsorge',
    'betriebliche altersvorsorge', 'bav', 'fitnessstudio',
    'gesundheitsförderung', 'mitarbeiterrabatte', 'corporate benefits',
    'team events', 'firmenevents', 'weiterbildung', 'fortbildung',
    'schulungen', 'health insurance', 'pension', 'company car',
    'gym membership', 'paid time off', 'pto', 'parental leave',
    'free lunch', 'stock options', 'equity', 'rsu', 'full-time',
    'full time', 'part-time', 'part time', 'permanent',
];

const STOP_LIST_GENERIC_ADJECTIVES = [
    'dynamisch', 'innovativ', 'innovation', 'innovationen', 'modern',
    'agil', 'engagiert', 'motiviert', 'enrichment', 'anreicherung',
    'icp', 'icps', 'playbook', 'playbooks', 'pipeline-aufbau',
    'pipeline aufbau', 'erfahren', 'qualifiziert', 'kompetent',
    'professionell', 'zuverlässig', 'kreativ', 'offen', 'freundlich',
    'sympathisch', 'erfolgreich', 'wachsend', 'führend',
    'international', 'spannend', 'abwechslungsreich', 'vielseitig',
    'anspruchsvoll', 'herausfordernd', 'verantwortungsvoll',
    'zukunftsorientiert', 'namhaft', 'renommiert', 'dynamic',
    'innovative', 'modern', 'engaged', 'experienced', 'qualified',
    'competent', 'professional', 'reliable', 'creative', 'successful',
    'leading', 'international', 'exciting', 'challenging', 'rewarding',
];

const STOP_LIST_FILLER_PHRASES = [
    'du bringst mit', 'sie bringen mit', 'wir bieten', 'wir bieten dir',
    'wir bieten ihnen', 'wir suchen', 'werde teil', 'werden sie teil',
    'werde teil unseres teams', 'werden sie teil unseres teams',
    'das bringen sie mit', 'das bringst du mit', 'was wir bieten',
    'das erwartet dich', 'das erwartet sie', 'deine aufgaben',
    'ihre aufgaben', 'dein profil', 'ihr profil', 'unser angebot',
    'über uns', 'über das unternehmen', 'ab sofort',
    'zum nächstmöglichen zeitpunkt', 'zum nächstmöglichen termin',
    'und', 'oder', 'bzw', 'bzw.', 'etc', 'etc.', 'usw', 'usw.',
    'diverse', 'sonstige', 'sonstiges', 'allgemein', 'allgemeines',
    'gut', 'gute', 'guter', 'gutes', 'sehr gut', 'you bring',
    'we offer', 'we provide', 'about us', 'your tasks',
    'your responsibilities', 'we are looking for', 'about the role',
    'and', 'or', 'various', 'general', 'good', 'other', 'misc',
    'about company', 'company description', 'y', 'o', 'varios',
    'general', 'bueno', 'otros',
];

const STOP_LIST_JOB_TITLES = [
    'sdr', 'bdr', 'kam', 'ceo', 'cfo', 'cto', 'cmo', 'coo',
    'sales development representative', 'business development representative',
    'account manager', 'account executive', 'project manager',
    'product manager', 'vertriebsleiter', 'projektleiter',
    'geschäftsführer',
];

const STOP_LIST_OUTDATED_TECH = [
    'ms office', 'ms office suite', 'ms-office', 'microsoft office suite',
    'office paket', 'office-paket', 'social media', 'web 2.0',
    'web2.0', 'internet-kenntnisse', 'internetkenntnisse',
    'internet kenntnisse', 'edv-kenntnisse', 'edvkenntnisse',
    'edv kenntnisse', 'pc-kenntnisse', 'pc kenntnisse',
    'computerkenntnisse', 'computer-kenntnisse',
];

export const ATS_STOP_LIST: ReadonlySet<string> = new Set([
    ...STOP_LIST_SOFT_SKILLS,
    ...STOP_LIST_BENEFITS,
    ...STOP_LIST_GENERIC_ADJECTIVES,
    ...STOP_LIST_FILLER_PHRASES,
    ...STOP_LIST_JOB_TITLES,
    ...STOP_LIST_OUTDATED_TECH,
].map(s => s.toLowerCase().trim()));

const ADJECTIVE_PREFIX_PATTERN = /^(hohe|hohes|hoher|hohen|ausgeprägte|ausgeprägter|ausgeprägtes|ausgeprägten|starke|starkes|starker|starken|sehr\s+gute|sehr\s+gutes|sehr\s+guter|sehr\s+guten|hervorragende|hervorragendes|hervorragender|hervorragenden|gute|gutes|guter|guten|großes|große|großer|sehr\s+hohe|sehr\s+hohes|außergewöhnliche|außergewöhnlicher|außergewöhnliches)\s+(.+)$/i;

const COMPOUND_SUFFIXES = [
    'skenntnisse', 'serfahrungen', 'serfahrung', 'skompetenzen',
    'skompetenz', 'sfähigkeiten', 'sfähigkeit', 'sexpertise',
    'sverständnis', 'kenntnisse', 'erfahrungen', 'erfahrung',
    'kompetenzen', 'kompetenz', 'fähigkeiten', 'fähigkeit',
    'expertise', 'verständnis',
];

export const KNOWN_HALLUCINATIONS: ReadonlySet<string> = new Set([
    'dsgvo', 'gdpr', 'rgpd',
    'datenschutz-grundverordnung', 'datenschutzgrundverordnung',
    'iso 27001', 'iso27001', 'iso-27001',
    'iso 9001', 'iso9001', 'iso-9001',
    'iso 26262', 'iso26262', 'iso-26262',
    'iso 14001', 'iso14001', 'iso-14001',
    'iso 13485', 'iso13485', 'iso-13485',
    'iso 45001', 'iso45001', 'iso-45001',
    'pci dss', 'pci-dss', 'pcidss',
    'soc 2', 'soc-2', 'soc2',
    'soc 1', 'soc-1', 'soc1',
    'cloud computing',
]);

const STOP_TOKENS_FOR_VERIFICATION: ReadonlySet<string> = new Set([
    'and', 'or', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'as', 'by',
    'with', 'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'mit',
    'auf', 'für', 'bei', 'y', 'o', 'el', 'la', 'los', 'las', 'un',
    'una', 'de', 'en', 'con',
]);

const HALLUCINATION_EQUIVALENCE_GROUPS = [
    ['dsgvo', 'gdpr', 'rgpd', 'datenschutz grundverordnung', 'datenschutz-grundverordnung', 'datenschutzgrundverordnung'],
];

export function buildAtsKeywordPrompt(languageName: string): string {
    return `string[] - ATS keywords: MAXIMUM 15, extracted EXCLUSIVELY from the job description text below.

HARD RULE: Each keyword MUST appear verbatim, as a direct translation, or as a clear semantic match in the job description. If a keyword is not grounded in the job description, you MUST NOT include it. Never invent keywords from training data or prior tasks. When in doubt, leave it out.

VALID CATEGORIES: software tools, frameworks, platforms, technical standards, certifications, domain terms, methodology terms, business metrics, industry-specific hard skills.

EXCLUDE: generic verbs, language names, generic soft-skill phrases, benefits, working conditions, standalone adjectives, job titles, company names that are only the employer or product focus, filler phrases, and whole sentences.

DACH RULE: Prefer indexable base terms over compounds when appropriate, e.g. "Projektleitungserfahrung" becomes "Projektleitung".

LANGUAGE: write language-dependent keywords in ${languageName}, e.g. Project Management becomes Projektmanagement for German. Keep proper nouns, product names, tool names, acronyms, and certifications in their original form. Quality over quantity: 8-12 strong keywords beats 20 weak ones.`;
}

function normalizeForComparison(value: string): string {
    return (value ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const NORMALIZED_STOP_LIST: ReadonlySet<string> = new Set(
    [...ATS_STOP_LIST].map(normalizeForComparison)
);

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCompoundSuffix(term: string): string {
    const lower = term.toLowerCase();
    for (const suffix of COMPOUND_SUFFIXES) {
        if (lower.endsWith(suffix) && lower.length > suffix.length + 3) {
            const core = term.slice(0, term.length - suffix.length);
            return core.charAt(0).toUpperCase() + core.slice(1);
        }
    }
    return term;
}

function normalizeSortDedup(candidates: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const trimmed = candidate.trim();
        const key = normalizeForComparison(trimmed);
        if (trimmed.length >= 2 && !seen.has(key)) {
            seen.add(key);
            out.push(trimmed);
        }
    }
    return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function isStopListed(value: string): boolean {
    const lower = value.toLowerCase().trim();
    const normalized = normalizeForComparison(value);
    return ATS_STOP_LIST.has(lower) || NORMALIZED_STOP_LIST.has(normalized);
}

export function filterAtsKeywords(candidates: string[] | null | undefined): FilterResult {
    if (!candidates || candidates.length === 0) {
        return { kept: [], removed: [] };
    }

    const kept: string[] = [];
    const removed: string[] = [];
    const rewritten: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();

    for (const raw of candidates) {
        if (typeof raw !== 'string') {
            removed.push(String(raw));
            continue;
        }

        const original = raw.trim();
        let candidate = original;

        if (candidate.length < 2 || candidate.length > 60) {
            removed.push(original);
            continue;
        }

        if (candidate.split(/\s+/).length > 5 || /^[\d\s\-.,]+$/.test(candidate)) {
            removed.push(original);
            continue;
        }

        if (isStopListed(candidate)) {
            removed.push(original);
            continue;
        }

        const stripped = stripCompoundSuffix(candidate);
        if (stripped !== candidate) {
            rewritten.push({ from: candidate, to: stripped });
            candidate = stripped;
        }

        if (isStopListed(candidate)) {
            removed.push(original);
            continue;
        }

        const prefixMatch = candidate.match(ADJECTIVE_PREFIX_PATTERN);
        if (prefixMatch?.[2] && isStopListed(prefixMatch[2].trim())) {
            removed.push(original);
            continue;
        }

        const normalizedCandidate = normalizeForComparison(candidate);
        let blockedByPhrase = false;
        for (const stopEntry of NORMALIZED_STOP_LIST) {
            if (!stopEntry.includes(' ')) continue;
            if (normalizedCandidate.includes(stopEntry)) {
                blockedByPhrase = true;
                break;
            }
        }
        if (blockedByPhrase) {
            removed.push(original);
            continue;
        }

        if (seen.has(normalizedCandidate)) {
            removed.push(original);
            continue;
        }

        seen.add(normalizedCandidate);
        kept.push(candidate);
    }

    const result: FilterResult = { kept, removed };
    if (rewritten.length > 0) result.rewritten = rewritten;
    return result;
}

function isTokenInJD(token: string, normalizedJD: string): boolean {
    if (!token) return false;
    if (token.length < 3) return true;

    if (token.length === 3) {
        return new RegExp(`\\b${escapeRegex(token)}\\b`).test(normalizedJD);
    }

    const stem = token.slice(0, Math.min(token.length, 6));
    return new RegExp(`\\b${escapeRegex(stem)}`).test(normalizedJD);
}

function isKeywordSubstantiated(
    normalizedKeyword: string,
    normalizedJD: string,
    jdNoSeparators: string,
): boolean {
    for (const group of HALLUCINATION_EQUIVALENCE_GROUPS) {
        if (!group.includes(normalizedKeyword)) continue;
        if (group.some(term => normalizedJD.includes(term) || jdNoSeparators.includes(term.replace(/[-_\s]+/g, '')))) {
            return true;
        }
    }

    if (normalizedKeyword && normalizedJD.includes(normalizedKeyword)) {
        return true;
    }

    const keywordNoSeparators = normalizedKeyword.replace(/[-_\s]+/g, '');
    if (keywordNoSeparators.length >= 4 && jdNoSeparators.includes(keywordNoSeparators)) {
        return true;
    }

    const tokens = normalizedKeyword
        .split(/[\s\-_]+/)
        .filter(token => token.length >= 3 && !STOP_TOKENS_FOR_VERIFICATION.has(token));

    if (tokens.length === 0) {
        const shortTokens = normalizedKeyword.split(/[\s\-_]+/).filter(token => token.length >= 2);
        return shortTokens.length > 0 && shortTokens.every(token => isTokenInJD(token, normalizedJD));
    }

    return tokens.every(token => isTokenInJD(token, normalizedJD));
}

export function filterByVerbatimJDPresence(
    keywords: string[] | null | undefined,
    jdText: string | null | undefined,
): FilterResult {
    if (!keywords || keywords.length === 0) {
        return { kept: [], removed: [] };
    }

    if (!jdText || jdText.length < 50) {
        return { kept: [...keywords], removed: [] };
    }

    const normalizedJD = normalizeForComparison(jdText);
    const jdNoSeparators = normalizedJD.replace(/[-_\s]+/g, '');
    const kept: string[] = [];
    const removed: string[] = [];

    for (const keyword of keywords) {
        if (typeof keyword !== 'string' || !keyword.trim()) {
            removed.push(String(keyword));
            continue;
        }

        const normalizedKeyword = normalizeForComparison(keyword);
        if (!KNOWN_HALLUCINATIONS.has(normalizedKeyword)) {
            kept.push(keyword);
            continue;
        }

        if (isKeywordSubstantiated(normalizedKeyword, normalizedJD, jdNoSeparators)) {
            kept.push(keyword);
        } else {
            removed.push(keyword);
        }
    }

    return { kept, removed };
}

export function cleanAtsKeywords(
    candidates: string[] | null | undefined,
    jdText: string | null | undefined,
): AtsKeywordCleanResult {
    const normalized = normalizeSortDedup(candidates ?? []);
    const stopList = filterAtsKeywords(normalized);
    const anchored = filterByVerbatimJDPresence(stopList.kept, jdText);

    const result: AtsKeywordCleanResult = {
        kept: normalizeSortDedup(anchored.kept),
        removed: [...stopList.removed, ...anchored.removed],
        stopListRemoved: stopList.removed,
        hallucinationRemoved: anchored.removed,
    };

    if (stopList.rewritten?.length) {
        result.rewritten = stopList.rewritten;
    }

    return result;
}
