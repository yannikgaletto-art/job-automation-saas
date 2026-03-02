/**
 * GET /api/certificates/[jobId]
 * Returns certificate recommendations for a specific job.
 *
 * Contract References:
 * - §3: user_id scoped queries
 * - §8: Auth Guard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        // Auth Guard (Contract §8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await params;

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // Query user-scoped (Contract §3)
        const { data, error } = await supabase
            .from('job_certificates')
            .select('status, recommendations, summary_text')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        return NextResponse.json({
            status: data.status,
            recommendations: data.recommendations,
            summary_text: data.summary_text,
        });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[Certificates] Get route error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
