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

            console.log(`📊 [Enrichment] Confidence for "${companyName}": ${confidence.toFixed(2)} (valid citations: ${validSources.length}/${citations.length})`);

            // Threshold: confidence < 0.9 → Empty State
            // 0.9 is achievable via: domain-match(0.4) + name-in-text(0.3) + 2-citations(0.2) = 0.9 ✅
            if (confidence < 0.9) {
                console.warn(`⚠️ Confidence ${confidence.toFixed(2)} < 0.9 for "${companyName}". Returning empty state.`);
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
 * MAIN: Enrich company (with cache + graceful degradation + Zero-Fake-Data)
 *
 * @param companySlug  Kept for caller compatibility (unused)
 * @param companyName  Canonical name used as cache key and Perplexity query
 * @param forceRefresh Skip cache lookup
 * @param context      Steckbrief context (website, industry, description).
 *                     Pass Stufe 0 from job Steckbrief, Stufe 1 from CV Match.
 *                     Without context, the Unsicherheits-Gate may return empty.
 */
export async function enrichCompany(
    companySlug: string,
    companyName: string,
    forceRefresh: boolean = false,
    context?: EnrichmentContext
): Promise<EnrichmentResult> {
    // Step 1: Check cache using companyName (Schema v3.0 uses name as key)
    if (!forceRefresh) {
        const cached = await checkCache(companyName);
        if (cached) return cached;
    } else {
        console.log(`🔄 Force refresh requested for: ${companyName}${context?.website ? ` ctx:${context.website}` : ''}`);
        recordCacheMiss();
    }

    // Step 2: Fetch fresh data with Zero-Fake-Data validation
    const intel = await fetchCompanyIntel(companyName, context);

    // If empty state (low confidence or unsicherheits-gate), skip cache write
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

    // Step 2.5: Generate Quotes if we have values
    if (intel.company_values && intel.company_values.length > 0) {
        console.log(`💡 Generating quotes for ${companyName}...`);
        const quotes = await suggestRelevantQuotes(companyName, intel.company_values, (intel as any).vision_and_mission || "");
        intel.suggested_quotes = quotes;
    }

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
