/**
 * Initiativ RSS Aggregator — Tier-1 Discovery Pipeline.
 *
 * Liest 3 DACH-Startup-RSS-Feeds (deutsche-startups, Gründerszene, EU Startups),
 * extrahiert Firmen-Trigger (Funding, M&A, GF-Wechsel, Product Launches),
 * upsertet sie in `initiativ_triggers` mit ON CONFLICT-Schutz.
 *
 * Wird täglich vom Inngest-Cron `initiativRssAggregator` getriggert.
 * Manueller Trigger via `POST /api/initiativ/aggregate` (User-ID-Whitelist).
 *
 * Kein LLM, keine externen AI-Calls. Heuristik-Regex für Trigger-Type-Detection.
 * Keine PII (RSS-Items sind public news).
 */

import Parser from 'rss-parser';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RssTriggerType =
    | 'funding'
    | 'gf_change'
    | 'merger'
    | 'product_launch'
    | 'press_release';

export interface RssSource {
    name: string;
    url: string;
}

export interface RawTrigger {
    triggerType: RssTriggerType;
    companyName: string;
    sourceUrl: string;
    sourceName: string;
    triggerDate: string; // ISO timestamp
    triggerSummary: string;
    rawContent: {
        title: string;
        contentSnippet?: string;
        feedSource: string;
    };
}

/**
 * Lean v1 — nur die 3 hochwertigsten Feeds. Bundesanzeiger + presseportal
 * werden nachgezogen wenn die ersten 3 stabil laufen (Spam-Risiko).
 */
export const INITIATIV_RSS_SOURCES: RssSource[] = [
    { name: 'deutsche-startups.de', url: 'https://www.deutsche-startups.de/feed/' },
    { name: 'gruenderszene.de', url: 'https://www.gruenderszene.de/feed' },
    { name: 'eu-startups.com', url: 'https://www.eu-startups.com/feed/' },
];

const FETCH_TIMEOUT_MS = 10_000;
const PARSE_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_SOURCE = 30;
const MAX_SUMMARY_LENGTH = 500;
const MAX_COMPANY_LENGTH = 120;

// ---------- Trigger-Type Heuristik ---------------------------------------
//
// Important: JavaScript's `\b` does NOT recognise non-ASCII letters (ü, ä, ö,
// ß) as word characters, so `/\bübernimmt\b/` never matches. We use
// non-consuming Unicode-aware lookarounds `(?<![\p{L}])` / `(?![\p{L}])`
// so the boundary checks don't eat chars and don't break .{0,N} spacing.

const FUNDING_PATTERNS: RegExp[] = [
    /(?<![\p{L}])(seed|series\s?[a-c]|pre-?seed|finanzierungsrunde|kapitalrunde)(?![\p{L}])/iu,
    /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s?(mio|millionen|million|m€|m\$)(?![\p{L}])/iu,
    /(?<![\p{L}])(sammelt|sichert\s?sich|raised|raises|secures|schließt\s?ab).{0,40}(?<![\p{L}])(investition|investment|funding|kapital|runde)(?![\p{L}])/iu,
];

const MERGER_PATTERNS: RegExp[] = [
    /(?<![\p{L}])(übernahme|übernimmt|übernommen|akquisition|akquiriert|merger|fusion|acquires|acquired|takes\s?over|buys\s?out|kauft)(?![\p{L}])/iu,
];

const GF_CHANGE_PATTERNS: RegExp[] = [
    /(?<![\p{L}])(neue[rn]?\s+(?:ceo|cfo|cto|coo|chief|geschäftsführ\p{L}+))(?![\p{L}])/iu,
    /(?<![\p{L}])(ernennt|appoints|tritt\s?zurück|steps?\s?down|wechsel\s?an\s?der\s?spitze)(?![\p{L}])/iu,
];

const PRODUCT_LAUNCH_PATTERNS: RegExp[] = [
    /(?<![\p{L}])(launch(?:t|en|es|ed|ing)?|startet|stellt\s?vor|veröffentlicht|geht\s?live|releases?|released|debuts|debüt)(?![\p{L}])/iu,
];

export function detectTriggerType(title: string, contentSnippet: string): RssTriggerType {
    const haystack = `${title} ${contentSnippet ?? ''}`;

    if (FUNDING_PATTERNS.some((p) => p.test(haystack))) return 'funding';
    if (MERGER_PATTERNS.some((p) => p.test(haystack))) return 'merger';
    if (GF_CHANGE_PATTERNS.some((p) => p.test(haystack))) return 'gf_change';
    if (PRODUCT_LAUNCH_PATTERNS.some((p) => p.test(haystack))) return 'product_launch';
    return 'press_release';
}

// ---------- Firmen-Name Heuristik -----------------------------------------

/**
 * Extrahiert den Firmen-Namen aus einem RSS-Item-Titel.
 *
 * Heuristik (lean), in Reihenfolge:
 *   Pattern A: "XY GmbH/AG/..." → "XY GmbH" (komplett mit Suffix)
 *   Pattern B: "Berliner Startup XY sammelt..." → "XY"
 *   Pattern C: "XY sammelt/launcht/übernimmt..." → "XY" (Subjekt vor Verb)
 *   Pattern D: Fallback Capital-Cluster (max 3 Tokens)
 *
 * Returnt null wenn nichts plausibles gefunden oder generic word matched.
 */

const COMPANY_TOKEN = '[A-Z][A-Za-zÄÖÜäöüß0-9&\\-\\.]+';
const COMPANY_SUFFIX = '(?:GmbH|AG|SE|KG|Inc\\.?|Ltd\\.?|LLC|UG)';
const COMPANY_INTRO = '(?:Startup|Scaleup|Firma|Unternehmen)';
const COMPANY_VERB = '(?:sammelt|sichert\\s?sich|raised?|raises|secures|übernimmt|übernommen|akquiriert|acquires|ernennt|appoints|launch(?:t|en|es|ed|ing)?|startet|stellt\\s?vor|releases?|released|geht\\s?live|veröffentlicht|debuts|tritt\\s?zurück|steps?\\s?down)';

const PATTERN_A = new RegExp(`^(${COMPANY_TOKEN}(?:\\s+${COMPANY_TOKEN}){0,2}?\\s+${COMPANY_SUFFIX})\\b`, '');
const PATTERN_B = new RegExp(`\\b${COMPANY_INTRO}\\s+(${COMPANY_TOKEN}(?:\\s+${COMPANY_TOKEN}){0,2})\\b`, '');
const PATTERN_C = new RegExp(`^(${COMPANY_TOKEN}(?:\\s+${COMPANY_TOKEN}){0,2})\\s+${COMPANY_VERB}`, 'i');
const PATTERN_D = new RegExp(`^(${COMPANY_TOKEN}(?:\\s+${COMPANY_TOKEN}){1,2})`, '');

// Reject candidates that are *only* a generic single word (article, city,
// generic noun). Multi-word candidates that happen to start with such a word
// (e.g. "Berlin Tech AG") are kept.
const GENERIC_SINGLE_WORDS = new Set([
    'der', 'die', 'das', 'the', 'neue', 'neuer', 'new', 'big', 'eine', 'ein', 'a',
    'dieses', 'diese', 'dieser', 'this',
    'berlin', 'münchen', 'hamburg', 'köln', 'frankfurt', 'stuttgart',
    'studie', 'report', 'bericht', 'markt', 'branche', 'analyse',
    'wirtschaft', 'industrie', 'business', 'news', 'wachstum',
]);

// Determiners — if the FIRST token is one of these AND the candidate has no
// company-suffix (GmbH/AG/...), it's almost certainly headline-noise like
// "Dieses Startup will...", "Die KI-Revolution frisst...", "Ein Wort bringt...".
const DETERMINER_PREFIX = new Set([
    'die', 'der', 'das', 'dieses', 'diese', 'dieser', 'this',
    'ein', 'eine', 'einer', 'the',
]);

// Person-title prefixes — strip these so we can re-evaluate the rest.
// Examples: "Food-Influencer Stefano Zarrella", "CEO Max Mustermann".
const PERSON_TITLE_RE = /^(?:[A-ZÄÖÜ][a-zäöüß]+-)?(?:Influencer|Influencerin|CEO|CFO|CTO|COO|CMO|CIO|CSO|Gründer|Gründerin|Mitgründer|Mitgründerin|Co-?Founder|Founder|Director|Manager|Geschäftsführer(?:in)?|Vorstand|Vorständin|Vorstandschef(?:in)?)\s+/i;

// Strip "Delft-based / London-based / Berlin-Brandenburg-based" geo-prefixes.
const GEO_PREFIX_RE = /^[A-ZÄÖÜ][\wäöüß]*(?:-[\wäöüß]+)*-based\s+/i;

// "Firstname Lastname" pattern: exactly 2 capitalised name-tokens, no digits,
// no company suffix, no hyphens — looks like a person, not a company.
const NAME_TOKEN_RE = /^[A-ZÄÖÜ][a-zäöüß]+$/;

const COMPANY_SUFFIX_RE = /\b(?:GmbH|AG|SE|KG|Inc\.?|Ltd\.?|LLC|UG|S\.?A\.?|N\.?V\.?|B\.?V\.?)\b/i;

function hasCompanySuffix(candidate: string): boolean {
    return COMPANY_SUFFIX_RE.test(candidate);
}

function looksLikePersonName(candidate: string): boolean {
    if (hasCompanySuffix(candidate)) return false;
    if (/\d/.test(candidate)) return false;
    const tokens = candidate.trim().split(/\s+/);
    if (tokens.length !== 2) return false;
    return NAME_TOKEN_RE.test(tokens[0]) && NAME_TOKEN_RE.test(tokens[1]);
}

function isAllGenericWords(candidate: string): boolean {
    const tokens = candidate.trim().toLocaleLowerCase('de-DE').split(/\s+/);
    if (tokens.length === 0) return true;
    return tokens.every((t) => GENERIC_SINGLE_WORDS.has(t));
}

function startsWithDeterminer(candidate: string): boolean {
    const first = candidate.trim().split(/\s+/)[0]?.toLocaleLowerCase('de-DE') ?? '';
    return DETERMINER_PREFIX.has(first);
}

function postProcessCandidate(raw: string): string | null {
    let cleaned = raw.trim();

    // 1. Strip geo-prefix: "Delft-based FrostByte" → "FrostByte"
    const beforeGeo = cleaned;
    cleaned = cleaned.replace(GEO_PREFIX_RE, '').trim();
    if (cleaned !== beforeGeo && cleaned.length === 0) return null;

    // 2. Strip person-title prefix: "Food-Influencer Stefano Zarrella" → "Stefano Zarrella".
    //    We track whether a person-title was actually stripped — only THEN do we
    //    dare reject the rest as a person-name (otherwise we'd false-reject
    //    legit two-word company names like "Berlin Tech" or "Prior Labs").
    const beforeTitle = cleaned;
    cleaned = cleaned.replace(PERSON_TITLE_RE, '').trim();
    const stripppedPersonTitle = cleaned !== beforeTitle;
    if (cleaned.length < 2) return null;

    // 3. Reject person-name pattern, but ONLY if a person-title was just
    //    stripped (strong signal we're in person-context, not company).
    if (stripppedPersonTitle && looksLikePersonName(cleaned)) return null;

    // 4. Reject all-generic candidates ("Der Markt", "The big news")
    if (isAllGenericWords(cleaned)) return null;

    // 5. Reject determiner-led candidates without company suffix:
    //    "Dieses Startup", "Die KI-Revolution", "Ein Wort"
    if (startsWithDeterminer(cleaned) && !hasCompanySuffix(cleaned)) return null;

    return cleaned.slice(0, MAX_COMPANY_LENGTH);
}

export function extractCompanyName(title: string): string | null {
    if (!title || title.trim().length < 3) return null;
    const cleanTitle = title.trim();

    const candidates: Array<string | undefined> = [
        cleanTitle.match(PATTERN_A)?.[1],
        cleanTitle.match(PATTERN_B)?.[1],
        cleanTitle.match(PATTERN_C)?.[1],
        cleanTitle.match(PATTERN_D)?.[1],
    ];

    for (const raw of candidates) {
        if (!raw) continue;
        const cleaned = postProcessCandidate(raw);
        if (cleaned) return cleaned;
    }

    return null;
}

// ---------- Item-Extraction -----------------------------------------------

type RssItem = {
    title?: string;
    link?: string;
    pubDate?: string;
    isoDate?: string;
    contentSnippet?: string;
    content?: string;
};

export function extractTriggerFromItem(
    item: RssItem,
    source: RssSource,
): RawTrigger | null {
    const title = (item.title ?? '').trim();
    const link = (item.link ?? '').trim();
    if (!title || !link) return null;

    const company = extractCompanyName(title);
    if (!company) return null;

    const dateRaw = item.isoDate ?? item.pubDate;
    const triggerDate = dateRaw ? new Date(dateRaw) : new Date();
    if (Number.isNaN(triggerDate.getTime())) return null;

    const contentSnippet = (item.contentSnippet ?? item.content ?? '').replace(/\s+/g, ' ').trim();
    const triggerType = detectTriggerType(title, contentSnippet);
    const summary = (contentSnippet || title).slice(0, MAX_SUMMARY_LENGTH);

    return {
        triggerType,
        companyName: company,
        sourceUrl: link,
        sourceName: source.name,
        triggerDate: triggerDate.toISOString(),
        triggerSummary: summary,
        rawContent: {
            title,
            contentSnippet: contentSnippet.slice(0, MAX_SUMMARY_LENGTH),
            feedSource: source.name,
        },
    };
}

// ---------- Dedup ---------------------------------------------------------

export function deduplicateTriggers(triggers: RawTrigger[]): RawTrigger[] {
    const seen = new Set<string>();
    const out: RawTrigger[] = [];
    for (const trigger of triggers) {
        const key = `${trigger.sourceUrl}|${trigger.triggerType}|${trigger.companyName.toLocaleLowerCase('de-DE')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trigger);
    }
    return out;
}

// ---------- Aggregator ----------------------------------------------------

/**
 * Holt alle 3 Feeds parallel via Promise.allSettled (eine Quelle down ≠ alle down),
 * extrahiert Trigger pro Item, dedupliziert.
 *
 * Override `sources` ist nur für Tests da — Production nutzt
 * INITIATIV_RSS_SOURCES.
 */
export async function aggregateInitiativTriggers(
    sources: RssSource[] = INITIATIV_RSS_SOURCES,
    parser?: Parser,
): Promise<RawTrigger[]> {
    const rssParser = parser ?? new Parser({ timeout: PARSE_TIMEOUT_MS });

    const fetchOne = async (source: RssSource): Promise<RawTrigger[]> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

            const response = await fetch(source.url, {
                headers: { 'User-Agent': 'Pathly/2.0 Initiativ-Aggregator' },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[initiativ-rss] ${source.name}: HTTP ${response.status}`);
                return [];
            }

            const xml = await response.text();
            const feed = await rssParser.parseString(xml);
            const items = (feed.items ?? []).slice(0, MAX_ITEMS_PER_SOURCE);

            const triggers: RawTrigger[] = [];
            for (const item of items) {
                const trigger = extractTriggerFromItem(item as RssItem, source);
                if (trigger) triggers.push(trigger);
            }

            console.log(`[initiativ-rss] ${source.name}: ${triggers.length}/${items.length} usable triggers`);
            return triggers;
        } catch (err) {
            console.warn(`[initiativ-rss] ${source.name} failed:`, (err as Error).message);
            return [];
        }
    };

    const results = await Promise.allSettled(sources.map(fetchOne));
    const allTriggers: RawTrigger[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') allTriggers.push(...result.value);
    }

    return deduplicateTriggers(allTriggers);
}

// ---------- Persist -------------------------------------------------------

/**
 * Upsertet in `initiativ_triggers` mit ON CONFLICT (source_url, trigger_type, company_name)
 * DO NOTHING — siehe Migration 20260507_initiativ_triggers.sql, uq_initiativ_triggers_source.
 *
 * Returnt Statistik für Cron-Logs.
 */
export async function persistTriggersToDB(
    triggers: RawTrigger[],
    supabase: SupabaseClient,
): Promise<{ attempted: number; persisted: number; errors: number }> {
    if (triggers.length === 0) {
        return { attempted: 0, persisted: 0, errors: 0 };
    }

    const rows = triggers.map((t) => ({
        trigger_type: t.triggerType,
        company_name: t.companyName,
        company_url: null,
        branche: null,
        region: null,
        source_url: t.sourceUrl,
        source_name: t.sourceName,
        trigger_date: t.triggerDate,
        trigger_summary: t.triggerSummary,
        raw_content: t.rawContent,
    }));

    let persisted = 0;
    let errors = 0;
    const batchSize = 20;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error, count } = await supabase
            .from('initiativ_triggers')
            .upsert(batch, {
                onConflict: 'source_url,trigger_type,company_name',
                ignoreDuplicates: true,
                count: 'exact',
            });

        if (error) {
            console.error(`[initiativ-rss] persist batch failed:`, error.message);
            errors += batch.length;
        } else {
            persisted += count ?? batch.length;
        }
    }

    return { attempted: rows.length, persisted, errors };
}
