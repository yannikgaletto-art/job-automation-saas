import { createClient } from '@supabase/supabase-js';
import { perplexityLimiter } from './rate-limiter';

export async function getCachedCompanyResearch(companySlug: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Check Cache (7 Tage)
    const { data: cached } = await supabase
        .from('company_research')
        .select('*')
        .eq('company_slug', companySlug)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .single();

    if (cached) {
        console.log(`Cache HIT for ${companySlug}`);
        return cached.intel_data;
    }

    // 2. Rate Limit Check
    const { success, remaining } = await perplexityLimiter.limit('global');

    if (!success) {
        throw new Error('Perplexity rate limit exceeded. Retry in 60s.');
    }

    console.log(`Perplexity: ${remaining} requests remaining this minute`);

    // 3. API Call (implementation folgt später)
    console.log(`Cache MISS for ${companySlug} - would call Perplexity API`);

    return null; // Placeholder
}
