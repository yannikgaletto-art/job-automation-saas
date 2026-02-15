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
 * CRITICAL: We ONLY fetch public company data, NO personal data!
 */
async function fetchCompanyIntel(
    companyName: string
): Promise<Partial<EnrichmentResult>> {
    // 1. Rate Limiting Check
    if (ratelimit) {
        const { success } = await ratelimit.limit('perplexity_enrichment');
        if (!success) {
            console.warn('Perplexity rate limit reached. Returning empty enrichment.');
            return { confidence_score: 0 };
        }
    }

    const MAX_RETRIES = 2; // Initial + 2 retries = 3 total
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
        attempt++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
            console.log(`🔍 Perplexity Research: ${companyName} (Attempt ${attempt})`);

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
                            content: `Find PUBLIC information about ${companyName}.
                            
                            Required information:
                            1. Recent news (last 3 months) - Max 3 headlines
                            2. Company values (from official website)
                            3. Tech stack (if tech company)
                            4. Last 5-7 LinkedIn posts from ${companyName} official page.
                            
                            For LinkedIn posts, extract:
                            - Post content (first 200 chars)
                            - Theme/Category (e.g., "Team Culture", "Product Launch")
                            - Engagement (likes + comments approx)
                            - Date posted (approx)
                            
                            Output as JSON:
                            {
                              "recent_news": ["headline1", "headline2"],
                              "company_values": ["value1", "value2"],
                              "tech_stack": ["tech1", "tech2"],
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
                // If 429, respect it immediately (don't retry endlessly if not handling retry-after)
                if (response.status === 429) {
                    console.warn('Perplexity 429 Too Many Requests');
                    break;
                }
                throw new Error(`Perplexity API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            const citations = data.citations || [];

            let parsed;
            try {
                // 1. Try parsing pure content (e.g. if model listens well)
                try {
                    parsed = JSON.parse(content);
                } catch {
                    // 2. Try extracting from markdown code block
                    const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/);
                    if (jsonMatch) {
                        parsed = JSON.parse(jsonMatch[1]);
                    } else {
                        // 3. Fallback: find first { and last }
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
                // Return low confidence result rather than retrying parser errors which are likely deterministic
                return { confidence_score: 0.1, perplexity_citations: citations };
            }

            let confidence = 0.0;
            if (parsed.recent_news?.length > 0) confidence += 0.3;
            if (parsed.company_values?.length > 0) confidence += 0.3;
            if (parsed.tech_stack?.length > 0) confidence += 0.2;
            if (parsed.linkedin_activity?.length > 0) confidence += 0.2;

            console.log(`✅ Enrichment Success (Confidence: ${confidence})`);

            return {
                recent_news: parsed.recent_news || [],
                company_values: parsed.company_values || [],
                tech_stack: parsed.tech_stack || [],
                linkedin_activity: parsed.linkedin_activity || [],
                suggested_quotes: [], // Filled in main function
                perplexity_citations: citations,
                confidence_score: confidence,
            };

        } catch (error: any) {
            clearTimeout(timeoutId);
            console.error(`Fetch Company Intel Error (Attempt ${attempt}):`, error.name, error.message);

            if (error.name === 'AbortError') {
                // Timeout
            }

            if (attempt > MAX_RETRIES) {
                console.warn('Max retries reached. Returning empty enrichment.');
                return { confidence_score: 0 };
            }

            // Exponential backoff: 1s, 2s, 4s...
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return { confidence_score: 0 };
}

/**
 * STEP 3: Save to cache
 */
async function saveToCache(
    companyName: string,
    intel: Partial<EnrichmentResult>
): Promise<string> {
    // Map to Schema v3.0 columns
    const insertData = {
        company_name: companyName,
        recent_news: intel.recent_news || [],
        linkedin_activity: intel.linkedin_activity || [],
        suggested_quotes: intel.suggested_quotes || [],
        // Store values and tech stack in generic intel_data jsonb
        intel_data: {
            company_values: intel.company_values || [],
            tech_stack: intel.tech_stack || [],
            source: 'perplexity'
        },
        // We removed company_slug from schema v3.0, using company_name as unique
        perplexity_citations: intel.perplexity_citations || [],
        researched_at: new Date().toISOString(),
        // expires_at automatically handled by DB default (7 days) but we can be explicit if needed
    };

    const { data, error } = await supabase
        .from('company_research')
        .upsert(insertData, { onConflict: 'company_name' })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to save to cache:', error);
        return ''; // Return empty string on failure, don't throw to keep flow alive
    }

    console.log(
        `💾 Cache WRITE: ${companyName} (TTL: 7 days)`
    );
    return data.id;
}

/**
 * MAIN: Enrich company (with cache + graceful degradation)
 */
export async function enrichCompany(
    companySlug: string, // Kept signature for compatibility, but we rely on companyName
    companyName: string,
    forceRefresh: boolean = false
): Promise<EnrichmentResult> {
    // Step 1: Check cache using companyName (Schema v3.0 uses name as key)
    if (!forceRefresh) {
        const cached = await checkCache(companyName);
        if (cached) return cached;
    } else {
        console.log(`🔄 Force refresh requested for: ${companyName}`);
        recordCacheMiss();
    }

    // Step 2: Fetch fresh data
    const intel = await fetchCompanyIntel(companyName);

    // Step 2.5: Generate Quotes if we have values
    if (intel.company_values && intel.company_values.length > 0) {
        console.log(`💡 Generating quotes for ${companyName}...`);
        const quotes = await suggestRelevantQuotes(intel.company_values);
        intel.suggested_quotes = quotes;
    }

    // Step 3: Save to cache
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
        perplexity_citations: intel.perplexity_citations || []
    };
}

/**
 * Link enrichment to job
 */
export async function linkEnrichmentToJob(
    jobId: string,
    companyResearchId: string
) {
    // Schema v3.0: company_research.job_id -> job_queue.id
    // We update the company_research record to point to this job
    const { error } = await supabase
        .from('company_research')
        .update({ job_id: jobId })
        .eq('id', companyResearchId);

    if (error) {
        console.error(`Failed to link enrichment to job ${jobId}:`, error);
        // Don't throw, non-critical
    } else {
        console.log(`🔗 Linked enrichment to job ${jobId}`);
    }
}
