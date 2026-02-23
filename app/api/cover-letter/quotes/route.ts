import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { suggestRelevantQuotes } from '@/lib/services/quote-matcher';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { jobId, companyName, companyValues, companyVision } = await req.json();
        if (!jobId || !companyName) {
            return NextResponse.json({ error: 'Missing jobId or companyName' }, { status: 400 });
        }

        const values: string[] = companyValues || [];
        if (values.length === 0) {
            console.warn('⚠️ [Quotes] No companyValues provided, using companyName as fallback');
            values.push(companyName);
        }

        console.log(`🔍 [Quotes] Fetching quotes for ${companyName} with ${values.length} values`);

        // Uses Perplexity for quote discovery + OpenAI fallback and embeddings for scoring
        const quotes = await suggestRelevantQuotes(companyName, values, companyVision || '');

        // Return top 3 with standardized shape
        const top3 = quotes.slice(0, 3).map((q) => ({
            quote: q.quote,
            author: q.author,
            source: q.source || '',
            matchedValue: q.matched_value,
            relevanceScore: q.match_score ?? q.relevance_score ?? 0,
        }));

        console.log(`✅ [Quotes] Returned ${top3.length} quotes for ${companyName}`);
        return NextResponse.json({ success: true, quotes: top3 });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Quotes] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
