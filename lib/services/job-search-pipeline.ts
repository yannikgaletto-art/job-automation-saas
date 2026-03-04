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

// ─── Werte-Filter Keyword Mapping ─────────────────────────────────

const WERTE_FILTER_KEYWORDS: Record<string, string> = {
    nachhaltigkeit: 'nachhaltig OR ESG OR Green OR Klimaschutz',
    innovation: 'Innovation OR Disruption OR Transformation',
    social_impact: 'Social Impact OR gemeinnützig OR NGO',
    deep_tech: 'Deep Tech OR KI OR AI OR Machine Learning',
    dei: 'Diversity OR Equity OR Inclusion OR Chancengleichheit',
    gemeinwohl: 'Gemeinwohl OR gemeinnützig OR Wohlfahrt OR Sozialwirtschaft',
    circular_economy: 'Circular Economy OR Kreislaufwirtschaft OR Recycling OR Nachhaltigkeit',
    new_work: 'New Work OR Remote OR Hybrid OR Flexibles Arbeiten',
};

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

    // Build query with Werte-Filter keyword injection
    let enrichedQuery = query;
    if (location) {
        // Appending location to the query works much better than SerpAPI's strict 'location' parameter
        enrichedQuery = `${query} ${location}`;
    }

    // We no longer append Werte-Filters to the query string here.
    // Google Jobs fails with 0 results when query strings are too complex (e.g. "Innovation OR Disruption").
    // Instead, Phase 10.3 handles this purely via Post-Search Tagging (`tagJobsWithFilters`) on the returned results.

    const params = new URLSearchParams({
        engine: 'google_jobs',
        q: `${enrichedQuery}`,
        hl: 'de',
        chips: 'date_posted:week',
        api_key: apiKey,
    });

    console.log(`[Search] SerpAPI search: "${enrichedQuery}"`);

    const response = await withRetry(async () => {
        const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
        if (!res.ok) throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
        return res.json();
    });

    const jobsResults = response.jobs_results || [];

    if (jobsResults.length === 0) {
        console.log('[Search] SerpAPI returned 0 results');
        return [];
    }

    // Map initial results — use share_link as the base link
    const mapped: SerpApiJob[] = jobsResults.map((job: any) => ({
        title: job.title || '',
        company_name: job.company_name || '',
        thumbnail: job.thumbnail || null,
        location: job.location || '',
        description: job.description || '',
        // Primary: share_link (Google Jobs link — always present)
        // Fallback: any apply_options if somehow present
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

    // Fetch real direct apply links via google_jobs_listing for top results
    // This is a second API call per job but gives actual employer apply URLs
    const MAX_LISTING_FETCHES = 10;
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
                    // Use the first direct apply link (usually the employer's own site)
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
    console.log(`[Search] ${jobsResults.length} raw → ${deduplicated.length} unique (${withLinks} with apply links)`);

    return deduplicated;
}

// ─── Step 2: Firecrawl Deep Scrape ────────────────────────────────

export async function deepScrapeJob(applyLink: string): Promise<string | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ [Pipeline] FIRECRAWL_API_KEY not set, skipping deep scrape');
        return null;
    }

    // Skip LinkedIn URLs (bot protection)
    if (applyLink.includes('linkedin.com')) {
        console.log('⚠️ [Pipeline] LinkedIn URL detected — skipping Firecrawl (bot protection)');
        return null;
    }

    try {
        console.log(`✅ [Pipeline] Firecrawl scraping: ${applyLink}`);
        const response = await withRetry(async () => {
            const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    url: applyLink,
                    formats: ['markdown'],
                    onlyMainContent: true,
                    waitFor: 2000,
                    timeout: 30000,
                }),
            });
            if (!res.ok) throw new Error(`Firecrawl error: ${res.status}`);
            return res.json();
        }, 2, 2000); // 2 retries, 2s backoff

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
                model: 'claude-3-5-sonnet-20241022',
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
