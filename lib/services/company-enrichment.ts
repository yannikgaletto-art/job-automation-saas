import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { suggestRelevantQuotes, type QuoteSuggestion } from './quote-matcher';
import { recordCacheHit, recordCacheMiss } from './cache-monitor';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Rate Limiter (if Redis env vars are present)
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

const ratelimit = redis
    ? new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'), // 10 requests per minute
        analytics: true,
    })
    : null;

interface EnrichmentResult {
    id: string;
    company_name: string;
    confidence_score: number;
    recent_news: string[];
    company_values: string[];
    tech_stack: string[];
    linkedin_activity: any[];
    suggested_quotes: QuoteSuggestion[];
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

/** Helper: strip protocol and www, e.g. "https://www.myty.com/page" → "myty.com" */
function extractDomain(url: string): string {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
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

/**
 * STEP 2: Fetch from Perplexity (if cache miss)
 *
 * Zero-Fake-Data Architecture (Batch 7):
 *   Stufe 0/1: EnrichmentContext injected into prompt for precise targeting
 *   Stufe 2/3: Citation validation + Confidence Score calculated below
 *
 * CRITICAL: We ONLY fetch public company data, NO personal data!
 */
async function fetchCompanyIntel(
    companyName: string,
    context?: EnrichmentContext
): Promise<Partial<EnrichmentResult> & { needs_company_context: boolean }> {
    // 1. Rate Limiting Check
    if (ratelimit) {
        const { success } = await ratelimit.limit('perplexity_enrichment');
        if (!success) {
            console.warn('Perplexity rate limit reached. Returning empty enrichment.');
            return getEmptyEnrichmentResult(companyName, !context?.website);
        }
    }

    // Build context-enriched prompt (Stufe 0 & 1)
    const contextHints: string[] = [];
    if (context?.website) contextHints.push(`Domain: ${context.website}`);
    if (context?.industry) contextHints.push(`Industry: ${context.industry}`);
    if (context?.description) contextHints.push(`Context: ${context.description}`);

    const contextString = contextHints.length > 0
        ? `\n\nCRITICAL CONTEXT TO MATCH:\n${contextHints.join('\n')}\nOnly return sources that STRICTLY match this exact company entity. Reject any sources from other companies.`
        : '';

    const MAX_RETRIES = 2;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
        attempt++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            console.log(`🔍 Perplexity Research: ${companyName} (Attempt ${attempt}${context?.website ? ` | ctx:${context.website}` : ''})`);

            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'sonar-pro',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a specialized company researcher.
                            Determine the company's primary region.
                            If DACH (Germany, Austria, Switzerland), output content in German.
                            Otherwise, output in English.`
                        },
                        {
                            role: 'user',
                            content: `Find PUBLIC information about ${companyName}.${contextString}
                                                        Required information:
                             1. Recent news (last 3 months) - specifically look for recent funding, valuation, seed rounds, or major growth.
                             2. Company Vision & Mission (what is their ultimate goal?).
                             3. Key Projects or Core Products.
                             4. Company values (from official website).
                             5. Last 5-7 LinkedIn posts from ${companyName} official page.
                             6. Current strategic challenges: What is ${companyName} visibly struggling with or actively trying to solve right now? Examples: scaling issues, team building, entering new markets, technical debt, competition pressure. STRICT FORMAT: Exactly 2 bullet points, maximum 15 words each.
                             7. Roadmap signals: Any public hints about ${companyName}'s direction in the next 6-12 months (expansion plans, product launches, hiring patterns, public announcements). STRICT FORMAT: Exactly 2 bullet points, maximum 15 words each.
                             
                             For LinkedIn posts, extract:
                             - Post content (first 200 chars)
                             - Theme/Category (e.g., "Team Culture", "Product Launch")
                             - Engagement (likes + comments approx)
                             - Date posted (approx)
                                                        Output as JSON:
                             {
                               "recent_news": ["headline1", "headline2"],
                               "vision_and_mission": "...",
                               "key_projects": ["project1", "project2"],
                               "funding_status": "...",
                               "company_values": ["value1", "value2"],
                               "current_challenges": ["challenge1 (max 15 words)", "challenge2 (max 15 words)"],
                               "roadmap_signals": ["signal1 (max 15 words)", "signal2 (max 15 words)"],
                               "linkedin_activity": [
                                 {
                                   "content": "...",
                                   "theme": "...",
                                   "engagement": "100+",
                                   "date": "2023-10-01"
                                 }
                               ]
                             }
                            
                            CRITICAL: Do NOT include employee names or personal data. Company-level data only.`,
                        },
                    ],
                    temperature: 0,
                    return_citations: true
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429) {
                    console.warn('Perplexity 429 Too Many Requests');
                    break;
                }
                throw new Error(`Perplexity API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content || '';
            const citations: string[] = data.citations || [];

            let parsed;
            try {
                try {
                    parsed = JSON.parse(content);
                } catch {
                    const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/);
                    if (jsonMatch) {
                        parsed = JSON.parse(jsonMatch[1]);
                    } else {
                        const firstOpen = content.indexOf('{');
                        const lastClose = content.lastIndexOf('}');
                        if (firstOpen !== -1 && lastClose !== -1) {
                            parsed = JSON.parse(content.substring(firstOpen, lastClose + 1));
                        } else {
                            throw new Error('No JSON found');
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to parse Perplexity JSON. Raw content:', content.substring(0, 200) + '...');
                return getEmptyEnrichmentResult(companyName, !context?.website);
            }

            // ─── Zero-Fake-Data Validation (Batch 7) ───────────────────────
            // Stufe 1: Domain/Name Filter on Citations
            const contextDomain = context?.website ? extractDomain(context.website) : null;
            const namePart = companyName.toLowerCase().replace(/\s+/g, '');

            const validSources = citations.filter(url => {
                const urlLower = url.toLowerCase();
                const domainMatch = contextDomain ? urlLower.includes(contextDomain) : false;
                const nameMatch = urlLower.includes(namePart);
                return domainMatch || nameMatch;
            });

            // Stufe 2: Unsicherheits-Gate
            // If no context was provided AND we found < 2 matching sources → block
            if (!context?.website && !context?.description && validSources.length < 2) {
                console.warn(
                    `⚠️ Unsicherheits-Gate for "${companyName}": ${validSources.length} valid citations, no context.`
                );
                return getEmptyEnrichmentResult(companyName, true); // needs_company_context = true
            }

            // Stufe 3: Explicit Confidence Score Schema (Batch 7, approved 2026-02-27)
            let confidence = 0.0;
            const responseTextLower = content.toLowerCase();
            const companyNameLower = companyName.toLowerCase();

            // +0.4 wenn Domain-Match in mindestens 1 Citation
            if (contextDomain && validSources.some(url => url.toLowerCase().includes(contextDomain))) {
                confidence += 0.4;
            } else if (!contextDomain && validSources.length > 0) {
                // Wenn kein Context-Domain, aber Name matched: partial score
                confidence += 0.2;
            }

            // +0.3 wenn companyName im Response-Text erwähnt wird (case-insensitive)
            if (responseTextLower.includes(companyNameLower)) {
                confidence += 0.3;
            }

            // +0.2 wenn mindestens 2 valide Citations vorhanden
            if (validSources.length >= 2) {
                confidence += 0.2;
            }

            // +0.1 wenn industry/description aus Steckbrief im Response-Text vorkommt
            if (context?.industry && responseTextLower.includes(context.industry.toLowerCase())) {
                confidence += 0.1;
            }

            // +0.1 wenn description/job context vorkommt (z.B. Position: Content & Inbound Marketing)
            if (context?.description) {
                // Check if any meaningful word from the description appears in the response
                const descWords = context.description.toLowerCase().split(/[\s:,]+/).filter(w => w.length > 4);
                if (descWords.some(w => responseTextLower.includes(w))) {
                    confidence += 0.1;
                }
            }

            console.log(`📊 [Enrichment] Confidence for "${companyName}": ${confidence.toFixed(2)} (valid citations: ${validSources.length}/${citations.length})`);

            // Threshold: context-dependent
            // With website: require 0.9 (domain-match(0.4) + name-in-text(0.3) + 2-citations(0.2) = 0.9)
            // Without website but with description: accept 0.7 (name-match(0.2) + name-in-text(0.3) + 2-citations(0.2) = 0.7)
            // Without any context: require 0.9 (stricter — no way to verify correctness)
            const requiredConfidence = (!context?.website && context?.description) ? 0.7 : 0.9;
            if (confidence < requiredConfidence) {
                console.warn(`⚠️ Confidence ${confidence.toFixed(2)} < ${requiredConfidence} for "${companyName}". Returning empty state.`);
                return getEmptyEnrichmentResult(companyName, !context?.website);
            }

            console.log(`✅ Enrichment Success (Confidence: ${confidence.toFixed(2)})`);

            return {
                recent_news: parsed.recent_news || [],
                company_values: parsed.company_values || [],
                tech_stack: [],
                linkedin_activity: parsed.linkedin_activity || [],
                suggested_quotes: [],
                perplexity_citations: validSources, // Only verified citations stored
                confidence_score: confidence,
                vision_and_mission: parsed.vision_and_mission || "",
                key_projects: parsed.key_projects || [],
                funding_status: parsed.funding_status || "",
                // First 90 Days data — strictly capped by Perplexity prompt
                current_challenges: (parsed.current_challenges || []).slice(0, 2),
                roadmap_signals: (parsed.roadmap_signals || []).slice(0, 2),
                needs_company_context: false,
            } as any;

        } catch (error: any) {
            clearTimeout(timeoutId);
            console.error(`Fetch Company Intel Error (Attempt ${attempt}):`, error.name, error.message);

            if (attempt > MAX_RETRIES) {
                console.warn('Max retries reached. Returning empty enrichment.');
                return getEmptyEnrichmentResult(companyName, !context?.website);
            }

            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return getEmptyEnrichmentResult(companyName, !context?.website);
}

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
            // First 90 Days fields — persisted in intel_data JSONB (no migration needed)
            current_challenges: (intel as any).current_challenges || [],
            roadmap_signals: (intel as any).roadmap_signals || [],
            source: 'perplexity'
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
 * STEP 2b: Jina AI Reader + Claude Haiku Fallback Chain
 *
 * When Perplexity returns empty (confidence < 0.9) AND we have a company_website:
 *   1. Jina AI reader (r.jina.ai) scrapes the company website — FREE, no API key needed
 *   2. Claude Haiku extracts structured intel_data from the scraped text
 *
 * Much more reliable than Firecrawl+OpenAI: Jina is free and always available,
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
        const truncatedContent = scrapedMarkdown.substring(0, 8000);

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
 * Enrichment Chain:
 *   1. Cache (7-day TTL)
 *   2. Jina+Claude (PRIMARY — when website is provided)
 *   3. Perplexity (FALLBACK — only if no website)
 *   4. Empty state (needs_company_context=true if no website)
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
        // Step 2 FALLBACK: Perplexity (only when NO website — legacy path)
        console.log(`🔍 [Enrichment] No website for "${companyName}" — trying Perplexity fallback`);
        intel = await fetchCompanyIntel(companyName, context);
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
