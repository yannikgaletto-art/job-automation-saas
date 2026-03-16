export const dynamic = 'force-dynamic';

/**
 * POST /api/job-search/query
 * 
 * Searches SerpAPI Google Jobs, caches in saved_job_searches (4h TTL),
 * deduplicates against job_queue, and enforces max 10 saved searches.
 * 
 * Supports two modes:
 * - 'keyword' (default): Direct SerpAPI query with user-provided keywords
 * - 'mission': GPT-4o-mini translates natural-language intent into keywords
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchJobs, type JobSearchFilters } from '@/lib/services/job-search-pipeline';
import OpenAI from 'openai';

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SAVED_SEARCHES = 10;

// ─── Mission Mode: Intent → Keywords ─────────────────────────────

async function translateMissionIntent(
    intent: string,
    fallbackLocation: string,
): Promise<{ query: string; location: string }> {
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const systemPrompt = `Du bist ein HR-Suchexperte. Der User beschreibt seine Karriere-Vision als Freitext.
Deine Aufgabe: Übersetze die Vision in einen KONKRETEN Jobtitel oder Berufsbezeichnung, die auf Google Jobs tatsächlich gefunden wird.

Regeln:
1. Der Suchbegriff MUSS ein realer Jobtitel sein (z.B. "Sustainability Manager", "Umweltberater", "CSR Referent"), KEIN abstraktes Konzept
2. Max 4 Wörter, deutsch oder englisch — je nachdem was auf dem Jobmarkt üblicher ist
3. Wenn die Vision abstrakt ist, finde den nächstliegenden, real existierenden Jobtitel
4. Standort extrahieren (falls erwähnt, sonst "Deutschland")

Beispiele:
- "Ich möchte das Umweltbewusstsein stärken" → "Sustainability Manager"
- "Ich will die Welt durch Technologie verbessern" → "Impact Engineer"
- "Ich möchte Menschen bei der Karriere helfen" → "Career Coach"

Antworte AUSSCHLIESSLICH in diesem JSON-Format:
{"query": "...", "location": "..."}
Keine Erklärungen, kein Markdown, nur das nackte JSON-Objekt.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: intent },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 100,
            temperature: 0.3,
        });

        const raw = completion.choices[0].message.content || '{}';
        const parsed = JSON.parse(raw);

        const extractedQuery = typeof parsed.query === 'string' && parsed.query.trim()
            ? parsed.query.trim()
            : intent;
        const extractedLocation = typeof parsed.location === 'string' && parsed.location.trim()
            ? parsed.location.trim()
            : fallbackLocation || 'Deutschland';

        console.log(`✅ [Search] Mission translated: "${intent}" → query="${extractedQuery}", location="${extractedLocation}"`);
        return { query: extractedQuery, location: extractedLocation };
    } catch (err) {
        console.warn('⚠️ [Search] Mission mode fallback to raw query:', err instanceof Error ? err.message : String(err));
        return { query: intent, location: fallbackLocation || 'Deutschland' };
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { query, location, filters, forceRefresh, mode } = body as {
            query: string;
            location: string;
            filters?: JobSearchFilters;
            forceRefresh?: boolean;
            mode?: 'keyword' | 'mission';
        };

        if (!query?.trim()) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        const searchMode = mode || 'keyword';
        const trimmedQuery = query.trim();
        const trimmedLocation = (location || '').trim();

        // ─── Mission Mode: translate intent → keywords ──────────────
        let serpApiQuery = trimmedQuery;
        let serpApiLocation = trimmedLocation;

        if (searchMode === 'mission') {
            const translated = await translateMissionIntent(trimmedQuery, trimmedLocation);
            serpApiQuery = translated.query;
            serpApiLocation = translated.location;
        }

        // ─── §12.4 Filter-Enriched Query: inject Werte keywords ─────
        // Append active Werte-filter labels to the SerpAPI query so
        // Google Jobs returns relevant results directly (not just post-tagging).
        if (filters?.werte && filters.werte.length > 0) {
            const WERTE_KEYWORDS: Record<string, string> = {
                nachhaltigkeit: 'Nachhaltigkeit',
                innovation: 'Innovation',
                social_impact: 'Social Impact',
                deep_tech: 'AI',
                dei: 'Diversity',
                gemeinwohl: 'Gemeinwohl',
                circular_economy: 'Kreislaufwirtschaft',
                new_work: 'Remote',
            };
            // Append only the first filter keyword to avoid over-constraining
            const firstKeyword = WERTE_KEYWORDS[filters.werte[0]];
            if (firstKeyword && !serpApiQuery.toLowerCase().includes(firstKeyword.toLowerCase())) {
                serpApiQuery = `${serpApiQuery} ${firstKeyword}`;
                console.log(`✅ [Search] Filter-enriched query: "${serpApiQuery}"`);
            }
        }

        // ─── 1. Cache Check (uses original intent as key) ───────────
        // Skip cache when Werte-Filters are active (§12.4) because the
        // enriched query differs from the cached non-filtered query.
        const hasWerteFilters = filters?.werte && filters.werte.length > 0;
        const { data: cached } = await supabase
            .from('saved_job_searches')
            .select('*')
            .eq('user_id', user.id)
            .eq('query', trimmedQuery)
            .eq('location', trimmedLocation)
            .single();

        if (cached && !forceRefresh && !hasWerteFilters) {
            const fetchedAt = new Date(cached.fetched_at).getTime();
            const now = Date.now();
            const hasResults = (cached.results || []).length > 0;
            if (now - fetchedAt < CACHE_TTL_MS && hasResults) {
                console.log(`✅ [Search] Cache hit for "${trimmedQuery}" in "${trimmedLocation}"`);

                // Cross-queue check for cached results
                const results = (cached.results || []) as any[];
                const enriched = await enrichWithQueueStatus(supabase, user.id, results);

                return NextResponse.json({
                    results: enriched,
                    cached: true,
                    search_id: cached.id,
                    result_count: enriched.length,
                });
            }
        }

        // ─── 2. SerpAPI Fetch (uses extracted keywords for mission) ──
        console.log(`✅ [Search] Querying SerpAPI: "${serpApiQuery}" in "${serpApiLocation}"`);
        const jobs = await searchJobs(serpApiQuery, serpApiLocation, filters);

        // ─── 3. Cross-Queue Check ────────────────────────────────────
        const enriched = await enrichWithQueueStatus(supabase, user.id, jobs);

        // ─── 3.5. Tag jobs with matching Werte-Filters ───────────────
        const tagged = await tagJobsWithFilters(enriched, filters?.werte);

        // ─── 4. Upsert into saved_job_searches ──────────────────────
        // query = original intent text (so accordion header shows user's words)
        const { data: upserted, error: upsertError } = await supabase
            .from('saved_job_searches')
            .upsert({
                user_id: user.id,
                query: trimmedQuery,
                location: trimmedLocation,
                filters: filters || {},
                results: tagged,
                result_count: tagged.length,
                fetched_at: new Date().toISOString(),
                search_mode: searchMode,
            }, {
                onConflict: 'user_id,query,location',
                ignoreDuplicates: false,
            })
            .select('id')
            .single();

        if (upsertError) {
            // Graceful degradation: return results so user sees what they waited for,
            // but flag that persistence failed — results will vanish on next navigation.
            console.error('⚠️ [Search] Upsert failed — results NOT persisted:', upsertError.message);
            return NextResponse.json({
                results: tagged,
                cached: false,
                search_id: null,
                result_count: tagged.length,
                persisted: false,
                warning: 'Ergebnisse konnten nicht gespeichert werden. Sie gehen beim Seitenwechsel verloren.',
            });
        }

        // ─── 5. Enforce max 10 searches ──────────────────────────────
        await enforceMaxSearches(supabase, user.id);

        return NextResponse.json({
            results: tagged,
            cached: false,
            search_id: upserted?.id || null,
            result_count: tagged.length,
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Search] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

// ─── Helpers ──────────────────────────────────────────────────────

async function enrichWithQueueStatus(
    supabase: any,
    userId: string,
    jobs: any[],
) {
    if (jobs.length === 0) return jobs;

    const applyLinks = jobs
        .map(j => j.apply_link)
        .filter(Boolean);

    if (applyLinks.length === 0) return jobs;

    const { data: existingJobs } = await supabase
        .from('job_queue')
        .select('source_url')
        .eq('user_id', userId)
        .in('source_url', applyLinks);

    const queuedUrls = new Set((existingJobs || []).map((j: any) => j.source_url));

    return jobs.map(job => ({
        ...job,
        already_in_queue: queuedUrls.has(job.apply_link),
    }));
}

async function enforceMaxSearches(supabase: any, userId: string) {
    const { data: allSearches } = await supabase
        .from('saved_job_searches')
        .select('id')
        .eq('user_id', userId)
        .order('fetched_at', { ascending: false });

    if (allSearches && allSearches.length > MAX_SAVED_SEARCHES) {
        const toDelete = allSearches.slice(MAX_SAVED_SEARCHES).map((s: any) => s.id);
        await supabase
            .from('saved_job_searches')
            .delete()
            .in('id', toDelete);
        console.log(`[Search] Cleaned up ${toDelete.length} old searches`);
    }
}

// ─── GPT-4o-mini Werte-Filter Tagging ─────────────────────────────

async function tagJobsWithFilters(
    jobs: any[],
    activeFilters?: string[]
): Promise<any[]> {
    // Only tag if user has selected Werte-Filters
    if (!activeFilters || activeFilters.length === 0 || jobs.length === 0) {
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }

    try {
        const openai = new OpenAI({ apiKey: openaiKey });

        const jobSummaries = jobs.map((j, i) =>
            `Job ${i}: "${j.title}" bei ${j.company_name}. ${(j.description || '').slice(0, 200)}`
        ).join('\n');

        const filterLabels: Record<string, string> = {
            nachhaltigkeit: 'Nachhaltigkeit (ESG, Klimaschutz, Umwelt)',
            innovation: 'Innovation (Disruption, Transformation)',
            social_impact: 'Social Impact (gemeinnützig, NGO, sozial)',
            deep_tech: 'Deep Tech (KI, AI, Machine Learning, Forschung)',
            dei: 'Diversity / Equity / Inclusion (Chancengleichheit, Vielfalt)',
            gemeinwohl: 'Gemeinwohl (gemeinnützig, Wohlfahrt, Sozialwirtschaft)',
            circular_economy: 'Circular Economy (Kreislaufwirtschaft, Recycling)',
            new_work: 'New Work (Remote, Hybrid, Flexibles Arbeiten, Agilität)',
        };

        const filterDescriptions = activeFilters
            .map(f => `"${f}": ${filterLabels[f] || f}`)
            .join(', ');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0,
            max_tokens: 500,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `Klassifiziere Jobs nach Werte-Filtern. Aktive Filter: ${filterDescriptions}.
Für jeden Job: Gib nur die Filter zurück, die WIRKLICH aus dem Text ersichtlich sind. Halluziniere NICHT.
Antwort als JSON: {"tags": [["filter1"], ["filter1", "filter2"], [], ...]}
Das Array hat exakt ${jobs.length} Einträge (einer pro Job). Leeres Array = kein Filter passt.`
                },
                { role: 'user', content: jobSummaries }
            ],
        });

        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) return jobs.map(j => ({ ...j, matched_filters: [] }));

        const parsed = JSON.parse(text);
        const tags: string[][] = parsed.tags || [];

        return jobs.map((job, i) => ({
            ...job,
            matched_filters: tags[i] || [],
        }));
    } catch (err) {
        console.warn('[Search] Filter tagging failed, continuing without tags');
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }
}
