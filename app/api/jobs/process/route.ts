import crypto from 'crypto';
import {
    enrichCompany,
    linkEnrichmentToJob,
} from '@/lib/services/company-enrichment';
import { generateCoverLetterWithQuality } from '@/lib/services/cover-letter-generator';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const requestId = crypto.randomUUID();
    const { jobId, userId, jobUrl, company, jobTitle } = await request.json();

    console.log(`[${requestId}] route=jobs/process step=start userId=${userId ?? 'anon'} jobId=${jobId ?? 'none'}`);

    // Helper for slugify
    const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // ========================================================================
    // STEP 0: Check for duplicates (Phase 2.4)
    // ========================================================================
    try {
        if (jobUrl) {
            const { checkDuplicateApplication } = await import('@/lib/services/application-history');
            const duplicateResult = await checkDuplicateApplication(
                userId,
                jobUrl,
                company ? slugify(company) : undefined,
                jobTitle
            );

            if (duplicateResult.isDuplicate) {
                console.warn(`[${requestId}] route=jobs/process step=duplicate_check blocked reason=${duplicateResult.reason}`);
                return Response.json({
                    success: false,
                    error: "DUPLICATE_APPLICATION",
                    details: duplicateResult,
                    requestId,
                }, { status: 409 });
            }
        }
    } catch (dupError) {
        console.error(`[${requestId}] route=jobs/process step=duplicate_check_error error=${dupError instanceof Error ? dupError.message : String(dupError)}`);
    }


    try {
        // Fetch job
        console.log(`[${requestId}] route=jobs/process step=db_fetch_job`);
        const { data: job, error: jobFetchError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobFetchError || !job) {
            console.error(`[${requestId}] route=jobs/process step=db_fetch_job supabase_error=${jobFetchError?.message} code=${jobFetchError?.code}`);
            return Response.json({ error: 'Job not found', requestId }, { status: 404 });
        }

        // ========================================================================
        // STEP 1: Enrich company data (with cache check)
        // ========================================================================

        console.log(`[${requestId}] route=jobs/process step=enrich_company`);

        const intel = await enrichCompany(job.company_slug, job.company_name);

        if (intel.id) {
            await linkEnrichmentToJob(jobId, intel.id);
            console.log(`[${requestId}] route=jobs/process step=enrichment_complete confidence=${intel.confidence_score}`);
        } else {
            console.log(`[${requestId}] route=jobs/process step=enrichment_skipped reason=no_public_data`);
            await supabase
                .from('job_queue')
                .update({
                    enrichment_status: 'skipped_no_data',
                    enrichment_fallback_reason: 'No public data found',
                })
                .eq('id', jobId);
        }

        // ========================================================================
        // STEP 2: Generate cover letter (with enriched data)
        // ========================================================================

        console.log(`[${requestId}] route=jobs/process step=generate_cover_letter`);

        const coverLetterResult = await generateCoverLetterWithQuality(jobId, userId);

        // ========================================================================
        // STEP 3: Update job status
        // ========================================================================
        console.log(`[${requestId}] route=jobs/process step=db_update_job`);

        const { error: updateError } = await supabase
            .from('job_queue')
            .update({
                status: 'ready_for_review',
                cover_letter: coverLetterResult.coverLetter,
                cover_letter_quality_score: coverLetterResult.finalScores?.overall_score || 0,
                ai_cost_cents: coverLetterResult.costCents,
            })
            .eq('id', jobId);

        if (updateError) {
            console.error(`[${requestId}] route=jobs/process step=db_update_job supabase_error=${updateError.message} code=${updateError.code}`);
        }

        const recentNews = intel?.recent_news ?? [];

        return Response.json({
            success: true,
            requestId,
            coverLetter: coverLetterResult.coverLetter,
            enrichment: {
                confidence: intel.confidence_score,
                hasNews: recentNews.length > 0,
            },
            cost: {
                coverLetter: coverLetterResult.costCents / 100,
                enrichment: intel.id ? 0.02 : 0,
                total: (coverLetterResult.costCents + (intel.id ? 2 : 0)) / 100,
            },
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] route=jobs/process step=unhandled_error error=${errMsg}`);

        return Response.json(
            { success: false, error: errMsg, requestId },
            { status: 500 }
        );
    }
}
