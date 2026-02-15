import {
    enrichCompany,
    linkEnrichmentToJob,
} from '@/lib/services/company-enrichment';
import { generateCoverLetter } from '@/lib/services/cover-letter-generator';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const { jobId, userId, jobUrl, company, jobTitle } = await request.json();

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
                company ? slugify(company) : undefined, // Helper needed or raw check
                jobTitle
            );

            if (duplicateResult.isDuplicate) {
                console.warn(`⚠️ Blocked duplicate application: ${duplicateResult.reason}`);
                return Response.json({
                    success: false,
                    error: "DUPLICATE_APPLICATION",
                    details: duplicateResult
                }, { status: 409 });
            }
        }
    } catch (dupError) {
        console.error("Duplicate check failed (non-blocking):", dupError);
    }


    try {
        // Fetch job
        const { data: job } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single();

        if (!job) {
            return Response.json({ error: 'Job not found' }, { status: 404 });
        }

        // ========================================================================
        // STEP 1: Enrich company data (with cache check)
        // ========================================================================

        console.log(`🔍 Enriching company: ${job.company_name}...`);

        const intel = await enrichCompany(job.company_slug, job.company_name);

        if (intel.id) {
            await linkEnrichmentToJob(jobId, intel.id);
            console.log(
                `✅ Enrichment complete (confidence: ${intel.confidence_score})`
            );
        } else {
            console.log(`⚠️  No enrichment data found (stealth startup?)`);
            // Mark as skipped
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

        console.log(`✍️  Generating cover letter in user's style...`);

        const coverLetterResult = await generateCoverLetter(userId, jobId);

        // ========================================================================
        // STEP 3: Update job status
        // ========================================================================

        await supabase
            .from('job_queue')
            .update({
                status: 'ready_for_review',
                cover_letter: coverLetterResult.coverLetter,
                ai_cost_cents: coverLetterResult.costCents,
            })
            .eq('id', jobId);

        return Response.json({
            success: true,
            coverLetter: coverLetterResult.coverLetter,
            enrichment: {
                confidence: intel.confidence_score,
                hasNews: intel.recent_news.length > 0,
            },
            cost: {
                coverLetter: coverLetterResult.costCents / 100,
                enrichment: intel.id ? 0.02 : 0, // €0.02 per Perplexity call
                total:
                    (coverLetterResult.costCents + (intel.id ? 2 : 0)) / 100,
            },
        });
    } catch (error: any) {
        console.error('Job processing error:', error);

        return Response.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
