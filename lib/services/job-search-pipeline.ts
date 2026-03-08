/**
 * Job Search Pipeline — SerpAPI → Firecrawl → GPT-4o-mini → Claude Judge
 * 
 * Implements the full pipeline from JOB_SEARCH_SPEC.md.
 * Each step is independent and testable.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────

export interface SerpApiJob {
    title: string;
    company_name: string;
    thumbnail?: string; // Company logo URL from SerpAPI
    location: string;
    description: string; // Short description from SerpAPI
    apply_link: string;
    detected_extensions: {
        posted_at?: string;
        schedule_type?: string;
        salary?: string;
        work_from_home?: boolean;
    };
    raw: Record<string, unknown>;
}

export interface HarvestedData {
    job_title: string;
    company_name: string;
    location: string | null;
    work_model: 'remote' | 'hybrid' | 'onsite' | 'unknown';
    contract_type: 'fulltime' | 'parttime' | 'freelance' | 'unknown';
    experience_years_min: number | null;
    experience_years_max: number | null;
    experience_level_stated: 'entry' | 'mid' | 'senior' | 'lead' | 'unknown';
    hard_requirements: string[];
    soft_requirements: string[];
    tasks: string[];
    benefits_and_perks: string[];
    about_company_raw: string | null;
    mission_statement_raw: string | null;
    diversity_section_raw: string | null;
    sustainability_section_raw: string | null;
    leadership_signals_raw: string | null;
    tech_stack_mentioned: string[];
    ats_keywords: string[];
    salary_range: string | null;
    application_deadline: string | null;
}

export interface JudgeResult {
    match_score_overall: number;
    score_breakdown: {
        experience_fit: number;
        values_fit: number;
        org_type_fit: number;
        diversity_fit: number;
        sustainability_fit: number;
        leadership_fit: number;
        innovation_fit: number;
        purpose_fit: number;
    };
    judge_reasoning: string;
    recommendation: 'apply' | 'consider' | 'skip';
    red_flags: string[];
    green_flags: string[];
    knockout_reason: string | null;
}

export interface UserValues {
    experience_level: string | null;
    company_values: string[];
    preferred_org_type: string[];
    diversity_important: boolean;
    sustainability_important: boolean;
    leadership_style_pref: number | null;
    innovation_level_pref: number | null;
    purpose_keywords: string[];
}

// ─── Retry Utility ────────────────────────────────────────────────

export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    backoffMs = 1000
): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            const wait = backoffMs * Math.pow(2, attempt);
            console.warn(`⚠️ [Pipeline] Retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
    throw new Error('Max retries exceeded');
}

// ─── Step 1: SerpAPI Search ───────────────────────────────────────


export interface JobSearchFilters {
    experience?: string[];   // ['Entry', 'Mid', 'Senior', 'Lead']
    orgType?: string[];      // ['Startup', 'Konzern', 'NGO', 'Staat']
    werte?: string[];        // ['nachhaltigkeit', 'innovation', ...]
}

export async function searchJobs(
    query: string,
    location: string,
    filters?: JobSearchFilters,
): Promise<SerpApiJob[]> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new Error('SERPAPI_KEY not configured');

    const MIN_RESULTS = 5;

    // Build base query
    const baseQuery = location ? `${query} ${location}` : query;

    // ── Progressive search: week → month → synonyms+month ──
    // Step 1: Last 7 days
    let rawJobs = await fetchSerpApiJobs(baseQuery, 'date_posted:week', apiKey);
    console.log(`[Search] Step 1 (week): ${rawJobs.length} results for "${baseQuery}"`);

    // Step 2: Widen to last 30 days if too few
    if (rawJobs.length < MIN_RESULTS) {
        const monthJobs = await fetchSerpApiJobs(baseQuery, 'date_posted:month', apiKey);
        console.log(`[Search] Step 2 (month): ${monthJobs.length} results`);
        rawJobs = deduplicateRawJobs([...rawJobs, ...monthJobs]);
    }

    // Step 3: Try synonym variations + month if still too few
    if (rawJobs.length < MIN_RESULTS) {
        const synonymQuery = generateSynonymQuery(query, location);
        if (synonymQuery && synonymQuery !== baseQuery) {
            const synonymJobs = await fetchSerpApiJobs(synonymQuery, 'date_posted:month', apiKey);
            console.log(`[Search] Step 3 (synonyms "${synonymQuery}"): ${synonymJobs.length} results`);
            rawJobs = deduplicateRawJobs([...rawJobs, ...synonymJobs]);
        }
    }

    if (rawJobs.length === 0) {
        console.log('[Search] No results after progressive expansion');
        return [];
    }

    // Map to SerpApiJob format
    const mapped: SerpApiJob[] = rawJobs.map((job: any) => ({
        title: job.title || '',
        company_name: job.company_name || '',
        thumbnail: job.thumbnail || null,
        location: job.location || '',
        description: job.description || '',
        apply_link: job.share_link
            || job.apply_options?.[0]?.link
            || job.related_links?.[0]?.link
            || '',
        detected_extensions: {
            posted_at: job.detected_extensions?.posted_at,
            schedule_type: job.detected_extensions?.schedule_type,
            salary: job.detected_extensions?.salary,
            work_from_home: job.detected_extensions?.work_from_home,
        },
        raw: job,
    }));

    // Fetch direct apply links for top 5 results (saves SerpAPI credits)
    const MAX_LISTING_FETCHES = 5;
    const jobsToEnrich = mapped.slice(0, MAX_LISTING_FETCHES);

    await Promise.allSettled(
        jobsToEnrich.map(async (job, index) => {
            const jobId = (job.raw as any).job_id;
            if (!jobId) return;

            try {
                const listingParams = new URLSearchParams({
                    engine: 'google_jobs_listing',
                    q: jobId,
                    api_key: apiKey,
                });

                const listingRes = await fetch(
                    `https://serpapi.com/search?${listingParams.toString()}`
                );
                if (!listingRes.ok) return;

                const listingData = await listingRes.json();
                const applyOptions = listingData.apply_options || [];

                if (applyOptions.length > 0) {
                    const directLink = applyOptions[0]?.link;
                    if (directLink) {
                        mapped[index].apply_link = directLink;
                    }
                }
            } catch {
                // Silently fall back to share_link
            }
        })
    );

    // Deduplicate on company_name + title
    const seen = new Set<string>();
    const deduplicated = mapped.filter(j => {
        const key = `${j.company_name}::${j.title}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const withLinks = deduplicated.filter(j => j.apply_link).length;
    console.log(`[Search] Final: ${deduplicated.length} unique (${withLinks} with apply links)`);

    return deduplicated;
}

// ─── SerpAPI fetch helper ─────────────────────────────────────────

async function fetchSerpApiJobs(query: string, dateChip: string, apiKey: string): Promise<any[]> {
    const params = new URLSearchParams({
        engine: 'google_jobs',
        q: query,
        hl: 'de',
        chips: dateChip,
        api_key: apiKey,
    });

    try {
        const response = await withRetry(async () => {
            const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
            if (!res.ok) throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
            return res.json();
        });
        return response.jobs_results || [];
    } catch (error) {
        console.warn(`[Search] SerpAPI fetch failed for "${query}":`, error);
        return [];
    }
}

// ─── Deterministic synonym expansion (no AI, no hallucination) ───

const SYNONYM_PAIRS: [string, string][] = [
    ['KI', 'AI'],
    ['Künstliche Intelligenz', 'Artificial Intelligence'],
    ['Manager', 'Beauftragter'],
    ['Manager', 'Koordinator'],
    ['Manager', 'Referent'],
    ['Berater', 'Consultant'],
    ['Leiter', 'Head of'],
    ['Projektmanager', 'Project Manager'],
    ['Entwickler', 'Developer'],
    ['Ingenieur', 'Engineer'],
];

function generateSynonymQuery(query: string, location: string): string | null {
    const lowerQuery = query.toLowerCase();

    for (const [a, b] of SYNONYM_PAIRS) {
        if (lowerQuery.includes(a.toLowerCase())) {
            const synonymQuery = query.replace(new RegExp(a, 'gi'), b);
            return location ? `${synonymQuery} ${location}` : synonymQuery;
        }
        if (lowerQuery.includes(b.toLowerCase())) {
            const synonymQuery = query.replace(new RegExp(b, 'gi'), a);
            return location ? `${synonymQuery} ${location}` : synonymQuery;
        }
    }

    return null;
}

// ─── Deduplicate raw SerpAPI results by job_id ────────────────────

function deduplicateRawJobs(jobs: any[]): any[] {
    const seen = new Set<string>();
    return jobs.filter(j => {
        const key = j.job_id || `${j.company_name}::${j.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─── Step 2: Deep Scrape (Jina Reader primary, Firecrawl fallback) ─

export async function deepScrapeJob(applyLink: string): Promise<string | null> {
    // Skip unsupported URLs
    if (applyLink.includes('linkedin.com')) {
        console.log('⚠️ [Pipeline] LinkedIn URL — skipping deep scrape (bot protection)');
        return null;
    }
    // Skip Google redirect URLs — they return a search page, not a job posting
    if (applyLink.includes('google.com/search?')) {
        console.log('⚠️ [Pipeline] Google redirect URL — skipping deep scrape');
        return null;
    }

    // ── Primary: Jina Reader (free, reliable, handles most ATS) ──
    const jinaResult = await scrapeWithJina(applyLink);
    if (jinaResult && jinaResult.length >= 200) {
        return jinaResult;
    }

    // ── Fallback: Firecrawl (for JS-heavy pages Jina can't render) ──
    const firecrawlResult = await scrapeWithFirecrawl(applyLink);
    if (firecrawlResult && firecrawlResult.length >= 200) {
        return firecrawlResult;
    }

    console.warn('⚠️ [Pipeline] Both scrapers failed or returned too little data');
    return null;
}

async function scrapeWithJina(url: string): Promise<string | null> {
    const apiKey = process.env.JINA_READER_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ [Pipeline] JINA_READER_API_KEY not set, skipping Jina');
        return null;
    }

    try {
        console.log(`🔄 [Pipeline] Jina Reader scraping: ${url}`);
        const res = await fetch(`https://r.jina.ai/${url}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/markdown',
                'X-No-Cache': 'true',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            console.warn(`⚠️ [Pipeline] Jina Reader error: ${res.status}`);
            return null;
        }

        const markdown = await res.text();
        console.log(`✅ [Pipeline] Jina Reader: ${markdown.length} chars extracted`);
        return markdown;
    } catch (error: any) {
        console.warn(`⚠️ [Pipeline] Jina Reader failed: ${error.message}`);
        return null;
    }
}

async function scrapeWithFirecrawl(url: string): Promise<string | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ [Pipeline] FIRECRAWL_API_KEY not set, skipping Firecrawl');
        return null;
    }

    try {
        console.log(`🔄 [Pipeline] Firecrawl scraping: ${url}`);
        const response = await withRetry(async () => {
            const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    url,
                    formats: ['markdown'],
                    onlyMainContent: true,
                    waitFor: 2000,
                    timeout: 30000,
                }),
            });
            if (!res.ok) throw new Error(`Firecrawl error: ${res.status}`);
            return res.json();
        }, 2, 2000);

        const markdown = response.data?.markdown || null;
        if (markdown) {
            console.log(`✅ [Pipeline] Firecrawl: ${markdown.length} chars extracted`);
        }
        return markdown;
    } catch (error) {
        console.error('❌ [Pipeline] Firecrawl failed:', error);
        return null;
    }
}

// ─── Step 3a: GPT-4o-mini Harvester ──────────────────────────────

export async function harvestJobData(
    markdown: string,
    fallbackDescription: string,
): Promise<HarvestedData | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ [Pipeline] OPENAI_API_KEY not set, skipping harvester');
        return null;
    }

    const textToAnalyze = markdown || fallbackDescription;
    if (!textToAnalyze || textToAnalyze.length < 50) {
        console.warn('⚠️ [Pipeline] Text too short for harvesting');
        return null;
    }

    const openai = new OpenAI({ apiKey });

    const systemPrompt = `Du bist ein präziser Daten-Extraktions-Assistent.
Extrahiere die folgenden Felder aus dem Markdown einer Stellenanzeige.
Halte dich STRIKT an das JSON-Schema.
Erfinde NICHTS. Wenn ein Feld im Text nicht vorkommt: null zurückgeben.
Antworte NUR mit validem JSON, kein Markdown.`;

    const userPrompt = `Extrahiere aus diesem Stellenanzeigen-Text:

${textToAnalyze.slice(0, 8000)}

JSON-Schema:
{
  "job_title": "string",
  "company_name": "string",
  "location": "string | null",
  "work_model": "remote | hybrid | onsite | unknown",
  "contract_type": "fulltime | parttime | freelance | unknown",
  "experience_years_min": "number | null",
  "experience_years_max": "number | null",
  "experience_level_stated": "entry | mid | senior | lead | unknown",
  "hard_requirements": ["string"],
  "soft_requirements": ["string"],
  "tasks": ["string"],
  "benefits_and_perks": ["string"],
  "about_company_raw": "string | null",
  "mission_statement_raw": "string | null",
  "diversity_section_raw": "string | null",
  "sustainability_section_raw": "string | null",
  "leadership_signals_raw": "string | null",
  "tech_stack_mentioned": ["string"],
  "ats_keywords": ["string"],
  "salary_range": "string | null",
  "application_deadline": "string | null"
}`;

    try {
        console.log('✅ [Pipeline] GPT-4o-mini harvesting...');
        const completion = await withRetry(async () =>
            openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            })
        );

        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) return null;

        const parsed = JSON.parse(text) as HarvestedData;
        console.log(`✅ [Pipeline] Harvester: extracted ${Object.keys(parsed).filter(k => (parsed as any)[k] !== null).length} fields`);
        return parsed;
    } catch (error) {
        console.error('❌ [Pipeline] Harvester failed:', error);
        return null;
    }
}

// ─── Step 3b: Claude Judge ───────────────────────────────────────

export async function judgeJob(
    harvested: HarvestedData,
    userValues: UserValues,
): Promise<JudgeResult | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ [Pipeline] ANTHROPIC_API_KEY not set, skipping judge');
        return null;
    }

    // Check: Harvester must have filled ≥ 50% of required fields
    const requiredFields = [
        'job_title', 'company_name', 'hard_requirements', 'tasks',
        'about_company_raw', 'work_model',
    ];
    const filledCount = requiredFields.filter(
        f => (harvested as any)[f] !== null && (harvested as any)[f] !== undefined
            && (!Array.isArray((harvested as any)[f]) || (harvested as any)[f].length > 0)
    ).length;

    if (filledCount < requiredFields.length * 0.5) {
        console.warn(`⚠️ [Pipeline] Judge skipped: only ${filledCount}/${requiredFields.length} required fields filled`);
        return null;
    }

    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = `Du bist der ehrliche Karriere-Coach und strategische Berater des Users.

Du hast Zugang zu:
1. Den extrahierten Daten einer Stellenanzeige (JSON).
2. Dem persönlichen Werteprofil des Users.

Deine Aufgabe: Bewerte den "Culture Fit" und die realistische Erfolgschance
dieser Bewerbung. Sei ehrlich — auch wenn es unbequem ist.
Halluziniere KEINE Informationen. Alles muss aus den gegebenen Daten stammen.
Antworte NUR mit validem JSON, kein Markdown.`;

    const userPrompt = `USER WERTEPROFIL:
${JSON.stringify(userValues, null, 2)}

EXTRAHIERTE JOB-DATEN:
${JSON.stringify(harvested, null, 2)}

Bewerte nach diesen Kriterien und gib ein JSON zurück:

{
  "match_score_overall": 0-100,
  "score_breakdown": {
    "experience_fit": 0-100,
    "values_fit": 0-100,
    "org_type_fit": 0-100,
    "diversity_fit": 0-100,
    "sustainability_fit": 0-100,
    "leadership_fit": 0-100,
    "innovation_fit": 0-100,
    "purpose_fit": 0-100
  },
  "judge_reasoning": "Max. 3 Sätze: Warum dieser Score?",
  "recommendation": "apply | consider | skip",
  "red_flags": ["string"],
  "green_flags": ["string"],
  "knockout_reason": "string | null"
}`;

    try {
        console.log('✅ [Pipeline] Claude Judge scoring...');
        const message = await withRetry(async () =>
            anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1000,
                temperature: 0.1,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            })
        );

        const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
        if (!text) return null;

        // Parse — handle potential markdown wrapping
        let jsonText = text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonText = jsonMatch[0];

        const parsed = JSON.parse(jsonText) as JudgeResult;
        console.log(`✅ [Pipeline] Judge: score=${parsed.match_score_overall}, rec=${parsed.recommendation}`);
        return parsed;
    } catch (error) {
        console.error('❌ [Pipeline] Judge failed:', error);
        return null;
    }
}

// ─── Default User Values (when none configured) ──────────────────

export function getDefaultUserValues(): UserValues {
    return {
        experience_level: 'mid',
        company_values: [],
        preferred_org_type: [],
        diversity_important: false,
        sustainability_important: false,
        leadership_style_pref: 3,
        innovation_level_pref: 3,
        purpose_keywords: [],
    };
}
