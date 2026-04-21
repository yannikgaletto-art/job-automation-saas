import type { OpportunityInsert } from '@/types/volunteering';

// ============================================================================
// Volunteering Scraper Service
// ============================================================================
// Fetches and parses volunteering opportunities from 5 external sources.
// Each source has its own parser. Data is normalized to OpportunityInsert format.
// Uses plain fetch + regex/string parsing (no Cheerio dependency needed for MVP).
// ============================================================================

const USER_AGENT = 'Pathly/2.0 Volunteering-Aggregator (contact@path-ly.eu)';
const FETCH_TIMEOUT = 10_000; // 10s

async function fetchPage(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
        if (!res.ok) {
            console.error(`⚠️ [scraper] HTTP ${res.status} for ${url}`);
            return null;
        }
        return await res.text();
    } catch (err) {
        console.error(`❌ [scraper] Fetch failed for ${url}:`, err);
        return null;
    }
}

// ─── Parser: vostel.de ────────────────────────────────────────────
function parseVostel(html: string): OpportunityInsert[] {
    const results: OpportunityInsert[] = [];
    // Match project links with title and org
    const projectRegex = /<a[^>]*href="(\/de\/volunteering\/projects\/[^"]+)"[^>]*>[\s\S]*?<h\d[^>]*>([\s\S]*?)<\/h\d>[\s\S]*?<(?:p|span)[^>]*>([\s\S]*?)<\/(?:p|span)>/gi;
    let match;
    while ((match = projectRegex.exec(html)) !== null && results.length < 20) {
        const url = `https://vostel.de${match[1]}`;
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const org = match[3].replace(/<[^>]*>/g, '').trim();
        if (title && org && title.length > 5) {
            results.push({
                title,
                organization: org,
                category: 'social',
                city: 'Berlin',
                url,
                source: 'vostel',
                commitment_type: 'flexibel',
            });
        }
    }
    return results;
}

// ─── Parser: gute-tat.de ─────────────────────────────────────────
function parseGuteTat(html: string): OpportunityInsert[] {
    const results: OpportunityInsert[] = [];
    const projectRegex = /<a[^>]*href="(https:\/\/www\.gute-tat\.de\/soziale-projekte\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = projectRegex.exec(html)) !== null && results.length < 20) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (title && title.length > 5 && !title.toLowerCase().includes('mehr info')) {
            results.push({
                title,
                organization: 'Stiftung Gute-Tat',
                category: 'social',
                city: 'Berlin',
                url,
                source: 'gute-tat',
                commitment_type: 'regelmaessig',
            });
        }
    }
    return results;
}

// ─── Parser: berliner-stadtmission.de ─────────────────────────────
function parseStadtmission(html: string): OpportunityInsert[] {
    const results: OpportunityInsert[] = [];
    const linkRegex = /<a[^>]*href="(https?:\/\/www\.berliner-stadtmission\.de\/ehrenamt[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 15) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (title && title.length > 5) {
            results.push({
                title,
                organization: 'Berliner Stadtmission',
                category: 'social',
                city: 'Berlin',
                url,
                source: 'stadtmission',
                commitment_type: 'flexibel',
            });
        }
    }
    return results;
}

// ─── Parser: berliner-obdachlosenhilfe.de ─────────────────────────
function parseObdachlosenhilfe(html: string): OpportunityInsert[] {
    const results: OpportunityInsert[] = [];
    const linkRegex = /<a[^>]*href="(https?:\/\/www\.berliner-obdachlosenhilfe\.de[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (title && title.length > 10 && !title.includes('http')) {
            results.push({
                title,
                organization: 'Berliner Obdachlosenhilfe e.V.',
                category: 'social',
                city: 'Berlin',
                url,
                source: 'obdachlosenhilfe',
                commitment_type: 'einmalig',
            });
        }
    }
    return results;
}

// ─── Parser: DSEE ─────────────────────────────────────────────────
function parseDSEE(html: string): OpportunityInsert[] {
    const results: OpportunityInsert[] = [];
    const linkRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (title && title.length > 10 && url.includes('engagement')) {
            results.push({
                title,
                organization: 'Deutsche Stiftung für Engagement und Ehrenamt',
                category: 'social',
                city: 'Berlin',
                url,
                source: 'dsee',
                commitment_type: 'flexibel',
            });
        }
    }
    return results;
}

// ─── Source Registry ──────────────────────────────────────────────
interface ScraperSource {
    name: string;
    url: string;
    parser: (html: string) => OpportunityInsert[];
}

export const SCRAPER_SOURCES: ScraperSource[] = [
    { name: 'vostel', url: 'https://vostel.de/de/volunteering/projects', parser: parseVostel },
    { name: 'gute-tat', url: 'https://www.gute-tat.de/soziale-projekte/', parser: parseGuteTat },
    { name: 'stadtmission', url: 'https://www.berliner-stadtmission.de/ehrenamt', parser: parseStadtmission },
    { name: 'obdachlosenhilfe', url: 'https://www.berliner-obdachlosenhilfe.de', parser: parseObdachlosenhilfe },
    { name: 'dsee', url: 'https://www.deutsche-stiftung-engagement-und-ehrenamt.de/engagement-finden-in-berlin/', parser: parseDSEE },
];

// ─── Main Scrape Function ─────────────────────────────────────────
export async function scrapeAllSources(): Promise<{ source: string; count: number; error?: string }[]> {
    const results: { source: string; opportunities: OpportunityInsert[]; error?: string }[] = [];

    // Sequential with 1s delay between sources (respectful rate limiting)
    for (const source of SCRAPER_SOURCES) {
        console.log(`🔍 [scraper] Fetching ${source.name}...`);
        const html = await fetchPage(source.url);
        if (!html) {
            results.push({ source: source.name, opportunities: [], error: 'Fetch failed' });
            continue;
        }

        try {
            const parsed = source.parser(html);
            console.log(`✅ [scraper] ${source.name}: ${parsed.length} opportunities found`);
            results.push({ source: source.name, opportunities: parsed });
        } catch (err) {
            console.error(`❌ [scraper] Parse error for ${source.name}:`, err);
            results.push({ source: source.name, opportunities: [], error: 'Parse failed' });
        }

        // 1s delay between sources
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results.map(r => ({
        source: r.source,
        count: r.opportunities.length,
        error: r.error,
    }));
}

export function getAllParsedOpportunities(
    results: { source: string; html: string | null }[]
): OpportunityInsert[] {
    const all: OpportunityInsert[] = [];
    for (const { source, html } of results) {
        if (!html) continue;
        const src = SCRAPER_SOURCES.find(s => s.name === source);
        if (src) {
            try {
                all.push(...src.parser(html));
            } catch {
                // Skip failed parsers
            }
        }
    }
    return all;
}
