import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { runCVMatchAnalysis } from '@/lib/services/cv-match-analyzer';

// Admin client bypasses RLS — needed because user-scoped client can't UPDATE job_queue
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
    try {
        const { jobId } = await req.json();
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use admin client for reads to avoid RLS issues
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const cvData = await getCVText(user.id);
        if (!cvData) {
            return NextResponse.json({
                error: 'CV not found or empty. Please upload your CV in settings.'
            }, { status: 400 });
        }

        const matchResult = await runCVMatchAnalysis({
            userId: user.id,
            jobId: job.id,
            cvText: cvData.text,
            jobTitle: job.job_title || 'Unknown Title',
            company: job.company_name || 'Unknown Company',
            jobDescription: job.description || '',
            requirements: job.requirements || [],
            atsKeywords: job.buzzwords || [],
            level: job.seniority || '',
        });

        // Cache result in job_queue.metadata using ADMIN client to bypass RLS
        const { data: currentJob } = await supabaseAdmin
            .from('job_queue')
            .select('metadata')
            .eq('id', jobId)
            .single();

        const currentMetadata = (currentJob?.metadata as Record<string, unknown>) || {};

        const { error: updateError } = await supabaseAdmin
            .from('job_queue')
            .update({
                metadata: {
                    ...currentMetadata,
                    cv_match: {
                        analyzed_at: new Date().toISOString(),
                        cv_document_id: cvData.documentId,
                        ...matchResult,
                    }
                },
                status: 'processing', // DB CHECK constraint only allows: pending, processing, ready_for_review, ready_to_apply, submitted, failed, skipped
            })
            .eq('id', jobId);

        if (updateError) {
            console.error('❌ Failed to save CV match to DB:', updateError.message);
        } else {
            console.log('💾 CV Match saved to DB for job:', jobId);
        }

        return NextResponse.json({ success: true, data: matchResult });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ CV Match failed:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
