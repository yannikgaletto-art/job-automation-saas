import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { suggestRelevantQuotes } from '@/lib/services/quote-matcher';

// validateUrl removed for Batch 7 — Quotes use text-based sources (books, speeches), not live URLs.

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { jobId, companyName, companyValues, companyVision, jobTitle, jobField } = await req.json();
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
        // jobTitle + jobField inject Stelle-Kontext per SICHERHEITSARCHITEKTUR.md Section 11
        const quotes = await suggestRelevantQuotes(
            companyName,
            values,
            companyVision || '',
            jobTitle || '',
            jobField || ''
        );

        // ✅ Map quotes to standard shape first
        const mapped = quotes.slice(0, 3).map((q) => ({
            quote: q.quote,
            author: q.author,
            source: q.source || '',
            matchedValue: q.matched_value,
            relevanceScore: q.match_score ?? q.relevance_score ?? 0,
        }));

        // ✅ Batch 7: validateUrl removed. LLM handles source attribution as text.
        console.log(`✅ [Quotes] Returned ${mapped.length} quotes for ${companyName}`);
        return NextResponse.json({ success: true, quotes: mapped });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Quotes] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
