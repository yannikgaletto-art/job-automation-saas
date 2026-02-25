export const dynamic = 'force-dynamic';

/**
 * POST /api/job-search/query
 * 
 * Searches SerpAPI Google Jobs, caches in saved_job_searches (4h TTL),
 * deduplicates against job_queue, and enforces max 10 saved searches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchJobs, type JobSearchFilters } from '@/lib/services/job-search-pipeline';

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SAVED_SEARCHES = 10;

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { query, location, filters, forceRefresh } = body as {
            query: string;
            location: string;
            filters?: JobSearchFilters;
            forceRefresh?: boolean;
        };

        if (!query?.trim()) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        const trimmedQuery = query.trim();
        const trimmedLocation = (location || '').trim();

        // ─── 1. Cache Check ──────────────────────────────────────────
        const { data: cached } = await supabase
            .from('saved_job_searches')
            .select('*')
            .eq('user_id', user.id)
            .eq('query', trimmedQuery)
            .eq('location', trimmedLocation)
            .single();

        if (cached && !forceRefresh) {
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

        // ─── 2. SerpAPI Fetch ────────────────────────────────────────
        console.log(`✅ [Search] Querying SerpAPI: "${trimmedQuery}" in "${trimmedLocation}"`);
        const jobs = await searchJobs(trimmedQuery, trimmedLocation, filters);

        // ─── 3. Cross-Queue Check ────────────────────────────────────
        const enriched = await enrichWithQueueStatus(supabase, user.id, jobs);

        // ─── 4. Upsert into saved_job_searches ──────────────────────
        const { data: upserted, error: upsertError } = await supabase
            .from('saved_job_searches')
            .upsert({
                user_id: user.id,
                query: trimmedQuery,
                location: trimmedLocation,
                filters: filters || {},
                results: enriched,
                result_count: enriched.length,
                fetched_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,query,location',
            })
            .select('id')
            .single();

        if (upsertError) {
            console.error('❌ [Search] Upsert failed:', upsertError.message);
        }

        // ─── 5. Enforce max 10 searches ──────────────────────────────
        await enforceMaxSearches(supabase, user.id);

        return NextResponse.json({
            results: enriched,
            cached: false,
            search_id: upserted?.id || null,
            result_count: enriched.length,
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
        console.log(`✅ [Search] Cleaned up ${toDelete.length} old searches`);
    }
}
