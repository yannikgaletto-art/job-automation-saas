import { createClient } from '@supabase/supabase-js';
// Upstash ratelimit removed (2026-03-30 Phase 2) — was only used for Perplexity API
import { recordCacheHit, recordCacheMiss } from './cache-monitor';
import { sanitizeForAI } from './pii-sanitizer';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EnrichmentResult {
    id: string;
    company_name: string;
    confidence_score: number;
    recent_news: string[];
    company_values: string[];
    tech_stack: string[];
    linkedin_activity: any[];
    suggested_quotes: any[];
    perplexity_citations: string[];
    needs_company_context?: boolean;
}

/**
 * EnrichmentContext — Stufe 0 Steckbrief / Stufe 1 CV Match fallback
 *
 * Injected by callers when available. Forms the anchor for Zero-Fake-Data
 * source validation. The more context provided, the higher possible confidence.
 *
 * Source of truth priority:
 *   1. Steckbrief (job_description fields: website, industry, description)
 *   2. CV Match result (company_url, company_description)
 *   3. Nothing → Unsicherheits-Gate may block result
 */
export interface EnrichmentContext {
    website?: string;        // e.g. "myty.com" or "https://myty.com"
    industry?: string;       // e.g. "Fashion-Tech"
    description?: string;    // brief company description, used for text-match
}


/** Empty result for Unsicherheits-Gate — confidence 0, UI shows request-context prompt */
function getEmptyEnrichmentResult(companyName: string, needsContext: boolean): Partial<EnrichmentResult> & { needs_company_context: boolean } {
    console.warn(`⚠️ [Enrichment] Empty State for "${companyName}" — needsContext=${needsContext}`);
    return {
        confidence_score: 0,
        recent_news: [],
        company_values: [],
        tech_stack: [],
        linkedin_activity: [],
        suggested_quotes: [],
        perplexity_citations: [],
        needs_company_context: needsContext,
    };
}

/**
 * STEP 1: Check 7-day cache (60% hit rate expected)
 */
async function checkCache(
    companyName: string
): Promise<EnrichmentResult | null> {
    // Schema v3.0: Lookup by company_name, check expires_at
    const { data, error } = await supabase
        .from('company_research')
        .select('*')
        .eq('company_name', companyName)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (data && !error) {
        // Map DB columns to Result Interface
        const daysUntilExpiry = Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        console.log(`✅ Cache HIT: ${companyName} (expires in ${daysUntilExpiry} days)`);
        recordCacheHit();

        // Parsing possibly JSONB fields
        const news = Array.isArray(data.recent_news) ? data.recent_news : [];
        const intel = data.intel_data || {};

        return {
            id: data.id,
            company_name: data.company_name,
            confidence_score: 1.0, // Cached data is considered high confidence
            recent_news: news,
            company_values: intel.company_values || [],
            tech_stack: intel.tech_stack || [],
            linkedin_activity: data.linkedin_activity || [],
            suggested_quotes: data.suggested_quotes || [],
            perplexity_citations: data.perplexity_citations || []
        };
    }

    if (error && error.code !== 'PGRST116') {
        console.warn(`Cache lookup warning for ${companyName}:`, error.message);
    }

    console.log(`❌ Cache MISS: ${companyName}`);
    recordCacheMiss();
    return null;
}

// fetchCompanyIntel() REMOVED (2026-03-30 Phase 2):
// Perplexity Sonar API was the fallback when no company website was provided.
// Decision: We now require a website URL for enrichment. Without URL → empty result.
// This eliminates the most expensive external API call in the pipeline.
// The Jina+Claude primary path (fetchViaJinaAndClaude) handles all enrichment.
//
// If Perplexity is needed again in the future, restore from git history:
//   git log --all -p -- lib/services/company-enrichment.ts

/**
 * STEP 3: Save to cache
 */
async function saveToCache(
    companyName: string,
    intel: Partial<EnrichmentResult>
): Promise<string> {
    const insertData = {
        company_name: companyName,
        recent_news: intel.recent_news || [],
        linkedin_activity: intel.linkedin_activity || [],
        suggested_quotes: intel.suggested_quotes || [],
        intel_data: {
            company_values: intel.company_values || [],
            vision_and_mission: (intel as any).vision_and_mission || "",
            key_projects: (intel as any).key_projects || [],
            funding_status: (intel as any).funding_status || "",
            industry_segment: (intel as any).industry_segment || "", // drives quote category routing
            // First 90 Days fields — persisted in intel_data JSONB (no migration needed)
            current_challenges: (intel as any).current_challenges || [],
            roadmap_signals: (intel as any).roadmap_signals || [],
            source: 'jina_claude' // Updated from 'perplexity' (2026-03-30 Phase 2)
        },
        perplexity_citations: intel.perplexity_citations || [],
        researched_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('company_research')
        .upsert(insertData, { onConflict: 'company_name' })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to save to cache:', error);
        return '';
    }

    console.log(`💾 Cache WRITE: ${companyName} (TTL: 7 days)`);
    return data.id;
}

/**
 * STEP 2: Jina AI Reader + Claude Haiku — PRIMARY enrichment path
 *
 * When we have a company_website:
 *   1. Jina AI reader (r.jina.ai) scrapes the company website — FREE, no API key needed
 *   2. Claude Haiku extracts structured intel_data from the scraped text
 *
 * Much more reliable than Perplexity: Jina is free and always available,
 * Claude Haiku is already used throughout the app.
 */
async function fetchViaJinaAndClaude(
    companyName: string,
    websiteUrl: string
): Promise<Partial<EnrichmentResult> & { needs_company_context: boolean } | null> {
    // ── Step 1: Jina AI Reader scrape ─────────────────────────────────────
    let scrapedMarkdown = '';
    try {
        const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
        const jinaUrl = `https://r.jina.ai/${normalizedUrl}`;
        console.log(`🔍 [Fallback] Jina AI scraping: ${jinaUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const jinaRes = await fetch(jinaUrl, {
            headers: {
                'Accept': 'text/plain',
                'X-Return-Format': 'markdown',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!jinaRes.ok) {
            console.warn(`⚠️ [Fallback] Jina HTTP ${jinaRes.status} for ${jinaUrl}`);
            return null;
        }

        scrapedMarkdown = await jinaRes.text();

        if (scrapedMarkdown.length < 100) {
            console.warn(`⚠️ [Fallback] Jina returned too little content (${scrapedMarkdown.length} chars)`);
            return null;
        }

        console.log(`✅ [Fallback] Jina scraped ${scrapedMarkdown.length} chars from ${websiteUrl}`);
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [Fallback] Jina error for ${websiteUrl}:`, errMsg);
        return null;
    }

    // ── Step 2: Claude Haiku structured extraction ─────────────────────────
    try {
        console.log(`🤖 [Fallback] Claude Haiku extracting intel for "${companyName}"...`);
        const { complete } = await import('@/lib/ai/model-router');

        // Truncate to ~8000 chars to stay within token limits
        // PII sanitization: website scrapes may contain employee names/contact info (DSGVO Art. 25)
        const truncatedContent = sanitizeForAI(scrapedMarkdown.substring(0, 8000)).sanitized;

        const prompt = `Du bist ein Unternehmens-Analyst. Extrahiere strukturierte Informationen aus dem folgenden Website-Inhalt von "${companyName}" (${websiteUrl}).

WEBSITE-INHALT:
${truncatedContent}

Antworte NUR mit validem JSON (kein Markdown, keine Erklärungen):
{
  "vision_and_mission": "Mission/Vision des Unternehmens (1-2 Sätze)",
  "recent_news": ["Neuigkeit 1", "Neuigkeit 2"],
  "company_values": ["Wert 1", "Wert 2", "Wert 3"],
  "key_projects": ["Hauptprodukt/Projekt 1", "Hauptprodukt/Projekt 2"],
  "funding_status": "Wachstums-/Funding-Status falls erkennbar, sonst leer"
}

Wenn eine Information nicht verfügbar ist, verwende ein leeres Array oder leeren String.`;

        const result = await complete({
            taskType: 'cv_parse',
            prompt,
            temperature: 0,
            maxTokens: 1024,
        });

        let parsed: any;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON in Claude response');
            parsed = JSON.parse(jsonMatch[0]);
        } catch {
            console.warn(`⚠️ [Fallback] Claude JSON parse failed for "${companyName}"`);
            return null;
        }

        const sourcesFound = [
            parsed.recent_news?.length > 0 ? 'news' : null,
            parsed.company_values?.length > 0 ? 'values' : null,
            parsed.vision_and_mission ? 'vision' : null,
            parsed.key_projects?.length > 0 ? 'projects' : null,
        ].filter(Boolean);

        console.log(`✅ [Fallback] Claude extracted ${sourcesFound.length} categories: [${sourcesFound.join(', ')}] for "${companyName}"`);

        if (sourcesFound.length === 0) {
            console.warn(`⚠️ [Fallback] Claude found 0 categories for "${companyName}"`);
            return null;
        }

        return {
            recent_news: parsed.recent_news || [],
            company_values: parsed.company_values || [],
            tech_stack: [],
            linkedin_activity: [],
            suggested_quotes: [],
            perplexity_citations: [websiteUrl],
            confidence_score: 0.9,
            vision_and_mission: parsed.vision_and_mission || '',
            key_projects: parsed.key_projects || '',
            funding_status: parsed.funding_status || '',
            needs_company_context: false,
        } as any;
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [Fallback] Claude extraction error for "${companyName}":`, errMsg);
        return null;
    }
}


/**
 * MAIN: Enrich company (with cache + graceful degradation)
 *
 * Enrichment Chain (post-Phase 2):
 *   1. Cache (7-day TTL)
 *   2. Jina+Claude (PRIMARY — when website is provided)
 *   3. Empty state (needs_company_context=true if no website)
 *
 * Perplexity fallback removed 2026-03-30 Phase 2.
 *
 * @param companySlug  Kept for caller compatibility (unused)
 * @param companyName  Canonical name used as cache key
 * @param forceRefresh Skip cache lookup
 * @param context      Steckbrief context (website, industry, description).
 */
export async function enrichCompany(
    companySlug: string,
    companyName: string,
    forceRefresh: boolean = false,
    context?: EnrichmentContext
): Promise<EnrichmentResult> {
    // Step 1: Check cache
    if (!forceRefresh) {
        const cached = await checkCache(companyName);
        if (cached) return cached;
    } else {
        console.log(`🔄 Force refresh requested for: ${companyName}${context?.website ? ` ctx:${context.website}` : ''}`);
        recordCacheMiss();
    }

    let intel: Partial<EnrichmentResult> & { needs_company_context: boolean };

    // Step 2: PRIMARY — Jina+Claude (when website is available)
    if (context?.website) {
        const normalizedUrl = context.website.startsWith('http')
            ? context.website
            : `https://${context.website}`;

        console.log(`🔍 [Enrichment] Using Jina+Claude (primary) for "${companyName}" with ${normalizedUrl}`);
        const jinaResult = await fetchViaJinaAndClaude(companyName, normalizedUrl);

        if (jinaResult && jinaResult.confidence_score && jinaResult.confidence_score > 0) {
            console.log(`✅ [Enrichment] Jina+Claude succeeded for "${companyName}" (confidence: ${jinaResult.confidence_score})`);
            intel = jinaResult;
        } else {
            console.warn(`⚠️ [Enrichment] Jina+Claude returned empty for "${companyName}" — returning empty state`);
            intel = getEmptyEnrichmentResult(companyName, false);
        }
    } else {
        // No website provided → return empty result (Perplexity removed 2026-03-30 Phase 2)
        console.log(`⚠️ [Enrichment] No website for "${companyName}" — returning empty (needs_company_context=true)`);
        intel = getEmptyEnrichmentResult(companyName, true);
    }

    // If still empty after all attempts, return empty state
    if (intel.confidence_score === 0) {
        return {
            id: '',
            company_name: companyName,
            confidence_score: 0,
            recent_news: [],
            company_values: [],
            tech_stack: [],
            linkedin_activity: [],
            suggested_quotes: [],
            perplexity_citations: [],
            needs_company_context: intel.needs_company_context,
        };
    }

    // Step 2.5: Quotes werden jetzt on-demand via /api/cover-letter/quotes geladen
    intel.suggested_quotes = [];

    // Step 3: Save to cache (only writes if confidence >= 0.9)
    const id = await saveToCache(companyName, intel);

    return {
        id,
        company_name: companyName,
        confidence_score: intel.confidence_score || 0.0,
        recent_news: intel.recent_news || [],
        company_values: intel.company_values || [],
        tech_stack: intel.tech_stack || [],
        linkedin_activity: intel.linkedin_activity || [],
        suggested_quotes: intel.suggested_quotes || [],
        perplexity_citations: intel.perplexity_citations || [],
        needs_company_context: false,
    };
}

/**
 * Link enrichment to job
 */
export async function linkEnrichmentToJob(
    jobId: string,
    companyResearchId: string
) {
    // Punkt 3: Skip gracefully when enrichment returned empty state (Batch 7)
    if (!companyResearchId) {
        console.warn('⚠️ [linkEnrichmentToJob] No enrichment.id — skipping link');
        return;
    }

    const { error } = await supabase
        .from('company_research')
        .update({ job_id: jobId })
        .eq('id', companyResearchId);

    if (error) {
        console.error(`Failed to link enrichment to job ${jobId}:`, error);
    } else {
        console.log(`🔗 Linked enrichment to job ${jobId}`);
    }
}
