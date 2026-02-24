export const dynamic = 'force-dynamic';

/**
 * POST /api/jobs/search
 * Quick SerpAPI search — returns results in ~2s for immediate UI display.
 * Does NOT run the deep pipeline (Firecrawl/Harvester/Judge).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchJobs } from '@/lib/services/job-search-pipeline';

export async function POST(request: NextRequest) {
    try {
        // Auth
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { query, location } = body;

        if (!query || !location) {
            return NextResponse.json(
                { error: 'Missing required fields: query, location' },
                { status: 400 }
            );
        }

        console.log(`✅ [Search] User ${user.id}: "${query}" in "${location}"`);

        const results = await searchJobs(query, location);

        console.log(`✅ [Search] Found ${results.length} jobs`);

        return NextResponse.json({
            success: true,
            jobs: results,
            count: results.length,
            query,
            location,
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Search] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
