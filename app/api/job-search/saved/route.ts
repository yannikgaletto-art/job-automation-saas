export const dynamic = 'force-dynamic';

/**
 * GET  /api/job-search/saved — List saved searches (max 10, newest first)
 * DELETE /api/job-search/saved?id={uuid} — Delete a specific saved search
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { data: searches, error } = await supabase
            .from('saved_job_searches')
            .select('id, query, location, filters, results, result_count, fetched_at')
            .eq('user_id', user.id)
            .order('fetched_at', { ascending: false })
            .limit(10);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Enrich results with already_in_queue status
        const allSearches = searches || [];
        if (allSearches.length > 0) {
            // Collect all unique apply_links across all searches
            const allLinks = new Set<string>();
            for (const s of allSearches) {
                if (Array.isArray(s.results)) {
                    for (const job of s.results) {
                        if (job.apply_link) allLinks.add(job.apply_link);
                    }
                }
            }

            if (allLinks.size > 0) {
                const { data: queuedJobs } = await supabase
                    .from('job_queue')
                    .select('source_url')
                    .eq('user_id', user.id)
                    .in('source_url', Array.from(allLinks));

                const queuedUrls = new Set((queuedJobs || []).map((j: any) => j.source_url));

                // Tag each job in each search
                for (const s of allSearches) {
                    if (Array.isArray(s.results)) {
                        s.results = s.results.map((job: any) => ({
                            ...job,
                            already_in_queue: queuedUrls.has(job.apply_link),
                        }));
                    }
                }
            }
        }

        return NextResponse.json({ searches: allSearches });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const url = new URL(request.url);
        const searchId = url.searchParams.get('id');

        if (!searchId) {
            return NextResponse.json({ error: 'Missing search ID' }, { status: 400 });
        }

        const { error } = await supabase
            .from('saved_job_searches')
            .delete()
            .eq('id', searchId)
            .eq('user_id', user.id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
