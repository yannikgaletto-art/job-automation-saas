import { createClient } from '@supabase/supabase-js';

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
}

/**
 * STEP 1: Check 7-day cache (60% hit rate expected)
 */
async function checkCache(
    companySlug: string
): Promise<EnrichmentResult | null> {
    const { data, error } = await supabase
        .rpc('get_fresh_company_research', { p_company_slug: companySlug })
        .single();

    if (data && !error) {
        const row = data as unknown as EnrichmentResult & { age_hours?: number };
        console.log(`✅ Cache HIT: ${companySlug} (${row.age_hours ?? '?'}h old)`);
        return row;
    }

    console.log(`❌ Cache MISS: ${companySlug}`);
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
                    role: 'user',
                    content: `Find PUBLIC information about ${companyName} (company-level only, NO employee data):

Required information:
1. Recent news (last 3 months) - Max 3 headlines
2. Company values (from official website)
3. Tech stack (if tech company)

Output as JSON:
{
  "recent_news": ["headline1", "headline2"],
  "company_values": ["value1", "value2"],
  "tech_stack": ["tech1", "tech2"]
}

CRITICAL: Do NOT include employee names, email addresses, or LinkedIn profiles. Company-level data only.`,
                },
            ],
            temperature: 0,
        }),
    });

    if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    try {
        // Extract JSON from potential markdown code blocks
        const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/) || [
            null,
            content,
        ];
        const parsed = JSON.parse(jsonMatch[1].trim());

        // Calculate confidence based on data completeness
        let confidence = 0.0;
        if (parsed.recent_news?.length > 0) confidence += 0.4;
        if (parsed.company_values?.length > 0) confidence += 0.3;
        if (parsed.tech_stack?.length > 0) confidence += 0.3;

        return {
            recent_news: parsed.recent_news || [],
            company_values: parsed.company_values || [],
            tech_stack: parsed.tech_stack || [],
            confidence_score: confidence,
        };
    } catch (error) {
        console.error('Failed to parse Perplexity response:', content);
        return {
            recent_news: [],
            company_values: [],
            tech_stack: [],
            confidence_score: 0.0,
        };
    }
}

/**
 * STEP 3: Save to cache
 */
async function saveToCache(
    companySlug: string,
    companyName: string,
    intel: Partial<EnrichmentResult>
): Promise<string> {
    const { data, error } = await supabase
        .from('company_research')
        .insert({
            company_slug: companySlug,
            company_name: companyName,
            data: { raw: intel },
            confidence_score: intel.confidence_score || 0.0,
            recent_news: intel.recent_news || [],
            company_values: intel.company_values || [],
            tech_stack: intel.tech_stack || [],
            data_source: 'perplexity',
        })
        .select('id')
        .single();

    if (error) throw error;

    console.log(
        `💾 Cached: ${companySlug} (confidence: ${intel.confidence_score})`
    );
    return data.id;
}

/**
 * MAIN: Enrich company (with cache + graceful degradation)
 */
export async function enrichCompany(
    companySlug: string,
    companyName: string
): Promise<EnrichmentResult> {
    // Step 1: Check cache
    const cached = await checkCache(companySlug);
    if (cached) return cached;

    // Step 2: Fetch fresh data
    try {
        const intel = await fetchCompanyIntel(companyName);

        // Step 3: Save to cache
        const id = await saveToCache(companySlug, companyName, intel);

        return {
            id,
            company_name: companyName,
            confidence_score: intel.confidence_score || 0.0,
            recent_news: intel.recent_news || [],
            company_values: intel.company_values || [],
            tech_stack: intel.tech_stack || [],
        };
    } catch (error) {
        console.error(`❌ Enrichment failed for ${companySlug}:`, error);

        // Graceful degradation: Return empty (system still works!)
        return {
            id: '',
            company_name: companyName,
            confidence_score: 0.0,
            recent_news: [],
            company_values: [],
            tech_stack: [],
        };
    }
}

/**
 * Link enrichment to job
 */
export async function linkEnrichmentToJob(
    jobId: string,
    companyResearchId: string
) {
    const { error } = await supabase.rpc('mark_enrichment_complete', {
        p_job_queue_id: jobId,
        p_company_research_id: companyResearchId,
    });

    if (error) throw error;

    console.log(`🔗 Linked enrichment to job ${jobId}`);
}
