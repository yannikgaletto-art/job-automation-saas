import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { findRelevantQuotes, type QuoteContext } from '@/lib/services/quote-service';

// DB-query typical <200ms. AI fallback (Claude Haiku) can take 3-5s on niche jobs.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { jobId, companyName, companyValues, companyVision, jobTitle, language } = await req.json();
        if (!jobId || !companyName) {
            return NextResponse.json({ error: 'Missing jobId or companyName' }, { status: 400 });
        }

        const values: string[] = companyValues || [];
        if (values.length === 0) {
            console.warn('⚠️ [Quotes] No companyValues provided, using companyName as fallback');
            values.push(companyName);
        }

        // ── Fetch industry_segment from Perplexity cache ──────────────────
        // Targeted lookup — we only read the intel_data JSONB key we need.
        // Falls back gracefully to undefined (job-title keyword matching takes over).
        let industrySegment: string | undefined;
        try {
            const serviceClient = createServiceClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            const { data: researchRow } = await serviceClient
                .from('company_research')
                .select('intel_data')
                .eq('company_name', companyName)
                .gt('expires_at', new Date().toISOString())
                .order('researched_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (researchRow?.intel_data?.industry_segment) {
                industrySegment = String(researchRow.intel_data.industry_segment);
                console.log(`🏭 [Quotes] Industry segment from DB: "${industrySegment}"`);
            } else {
                console.log(`ℹ️ [Quotes] No industry_segment in DB for "${companyName}" — using job-title category inference`);
            }
        } catch (err) {
            // Non-fatal: quote-service falls back to job-title keywords
            console.warn(`⚠️ [Quotes] Failed to fetch industry_segment:`, err);
        }

        console.log(`🔍 [Quotes] Search for "${companyName}" | title="${jobTitle}" | industry="${industrySegment || 'unknown'}" | ${values.length} values`);

        const ctx: QuoteContext = {
            jobTitle: jobTitle || companyName,
            companyValues: values,
            companyVision: companyVision || undefined,
            industrySegment,
            // Defensive mapping: only 'de' yields German. 'en', 'es', or any other locale → 'en'.
            // Prevents 'es' from silently falling back to 'de' (old === 'en' check had this bug).
            language: (language === 'de' ? 'de' : 'en') as 'de' | 'en',
        };

        const quotes = await findRelevantQuotes(ctx, 3);

        // Map to the existing frontend contract (QuoteSuggestion shape from quote-selector.tsx)
        const mapped = quotes.map(q => ({
            quote: q.quote,
            author: q.author,
            source: q.source || '',
            matchedValue: q.matchedValue,
            relevanceScore: q.relevanceScore,
            relevance_score: q.relevanceScore,  // Frontend uses both (legacy compat)
            match_score: q.relevanceScore,       // Frontend uses both (legacy compat)
            matched_value: q.matchedValue,       // Frontend uses snake_case
            value_connection: q.theme,           // "Why" block in QuoteSelector uses this
            language: ctx.language,              // Pass through for UI display
        }));

        const source = mapped.length > 0 ? (quotes[0].relevanceScore >= 0.8 ? 'DB' : 'AI') : 'none';
        console.log(`✅ [Quotes] Returned ${mapped.length} quotes for "${companyName}" (source: ${source})`);
        return NextResponse.json({ success: true, quotes: mapped });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Quotes] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
