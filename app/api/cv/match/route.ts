import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { inngest } from '@/lib/inngest/client';

/**
 * POST /api/cv/match — Smart Trigger
 *
 * DEV:  Runs synchronously (no Inngest CLI needed locally).
 * PROD: Fires Inngest background event (no Vercel timeout risk).
 *
 * Contracts: §8 (Auth Guard), §3 (user-scoped), §2 (CV Safety), JSONB Merge Pflicht
 */

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
    try {
        const { jobId, cvDocumentId } = await req.json();
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // §3: Ownership check (user-scoped)
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location, metadata')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // §2: CV Safety — verify CV exists before any processing
        const cvData = await getCVText(user.id, cvDocumentId);
        if (!cvData) {
            return NextResponse.json({
                error: 'CV not found or empty. Please upload your CV in settings.',
                code: 'CV_NOT_FOUND',
            }, { status: 400 });
        }

        const isDev = process.env.NODE_ENV === 'development';

        if (isDev) {
            // ─── DEV MODE: Run synchronously (no Inngest CLI needed) ─────────────
            console.log('🔧 [CV Match] DEV MODE — running synchronously');
            const { runCVMatchAnalysis } = await import('@/lib/services/cv-match-analyzer');

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

            const currentMetadata = (job.metadata as Record<string, unknown>) || {};
            await supabaseAdmin
                .from('job_queue')
                .update({
                    metadata: {
                        ...currentMetadata,
                        cv_match: {
                            analyzed_at: new Date().toISOString(),
                            cv_document_id: cvData.documentId,
                            ...matchResult,
                        },
                        cv_match_error: null,
                        cv_match_status: 'done',
                    },
                    status: 'cv_matched',
                })
                .eq('id', jobId)
                .eq('user_id', user.id);

            console.log(`✅ [CV Match DEV] Job ${jobId} analyzed and saved`);
            return NextResponse.json({ success: true, status: 'processing' });

        } else {
            // ─── PROD MODE: Fire Inngest event (background, retry-safe) ──────────
            console.log('🚀 [CV Match] PROD MODE — sending to Inngest');

            // Set processing status in metadata (JSONB Merge!)
            const currentMetadata = (job.metadata as Record<string, unknown>) || {};
            await supabaseAdmin
                .from('job_queue')
                .update({
                    metadata: {
                        ...currentMetadata,
                        cv_match_status: 'processing',
                    },
                })
                .eq('id', jobId)
                .eq('user_id', user.id);

            await inngest.send({
                name: 'cv-match/analyze',
                data: {
                    jobId,
                    userId: user.id,
                    cvDocumentId: cvData.documentId,
                },
            });

            return NextResponse.json({ success: true, status: 'processing' });
        }

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('❌ CV Match failed:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
