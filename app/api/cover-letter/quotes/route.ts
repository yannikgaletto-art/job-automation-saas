import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { suggestRelevantQuotes } from '@/lib/services/quote-matcher';

/**
 * validateUrl — HEAD fetch with a 3s timeout.
 * Returns true for non-URL strings (text sources like "Letter to Shareholders")
 * so they are never filtered out.
 * Returns false ONLY for strings that look like URLs but are unreachable.
 * (SICHERHEITSARCHITEKTUR.md Section 10)
 */
async function validateUrl(source: string): Promise<boolean> {
    if (!source) return false;
    // Only validate strings that look like URLs
    if (!source.startsWith('http://') && !source.startsWith('https://')) return true;
    try {
        const res = await fetch(source, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
        });
        return res.ok; // true only for 2xx
    } catch {
        return false;
    }
}

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

        // ✅ Filter invalid source URLs in parallel (SICHERHEITSARCHITEKTUR.md Section 10)
        const validated = await Promise.all(
            mapped.map(async (q) => ({
                ...q,
                source_valid: await validateUrl(q.source),
            }))
        );

        // Remove quotes with a URL source that returned non-200
        const top3 = validated
            .filter(q => q.source_valid)
            .map(({ source_valid: _sv, ...q }) => q); // strip internal field

        console.log(`✅ [Quotes] Returned ${top3.length} validated quotes for ${companyName}`);
        return NextResponse.json({ success: true, quotes: top3 });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Quotes] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
