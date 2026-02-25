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

        return NextResponse.json({ searches: searches || [] });
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
