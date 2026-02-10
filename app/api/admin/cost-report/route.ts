import { getCostStats } from '@/lib/ai/model-router';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
    // AI Costs (in-memory for current session)
    const aiStats = getCostStats();

    // Enrichment Stats (last 7 days)
    const { data: jobs } = await supabase
        .from('job_queue')
        .select('enrichment_status, created_at')
        .gte(
            'created_at',
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        );

    // Cache Stats
    const { data: companies } = await supabase
        .from('company_research')
        .select('confidence_score, created_at')
        .gte(
            'created_at',
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        );

    const completeJobs =
        jobs?.filter((j) => j.enrichment_status === 'complete').length || 0;
    const skippedJobs =
        jobs?.filter((j) => j.enrichment_status === 'skipped_no_data').length || 0;
    const failedJobs =
        jobs?.filter((j) => j.enrichment_status === 'failed').length || 0;
    const totalJobs = jobs?.length || 0;

    const report = {
        period: 'Last 7 days',
        ai_costs: {
            total_eur: aiStats.totalCostCents / 100,
            breakdown: aiStats.taskBreakdown,
        },
        enrichment: {
            total_jobs: totalJobs,
            complete: completeJobs,
            skipped: skippedJobs,
            failed: failedJobs,
            success_rate_percent:
                totalJobs > 0
                    ? ((completeJobs / totalJobs) * 100).toFixed(2)
                    : '0.00',
        },
        cache: {
            unique_companies: companies?.length || 0,
            avg_confidence:
                companies && companies.length > 0
                    ? (
                        companies.reduce(
                            (sum, c) => sum + (c.confidence_score || 0),
                            0
                        ) / companies.length
                    ).toFixed(2)
                    : '0.00',
            high_quality:
                companies?.filter((c) => c.confidence_score > 0.7).length || 0,
        },
    };

    return Response.json(report);
}
