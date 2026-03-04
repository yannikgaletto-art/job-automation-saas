export const dynamic = 'force-dynamic';

/**
 * /api/pulse/generate
 * GET — Generate deterministic task suggestions based on pipeline state.
 *
 * No AI/LLM calls. Pure DB-query → rule-mapping engine.
 * Auth Guard per SICHERHEITSARCHITEKTUR §8.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Types ────────────────────────────────────────────────────────

interface PulseSuggestion {
    id: string;
    title: string;
    estimated_minutes: number;
    priority: 'high' | 'medium' | 'low';
    category: 'review' | 'action' | 'setup';
    job_queue_id: string | null;
    deep_link: string;
    icon: string;
}

// ─── GET: Generate pulse suggestions ─────────────────────────────

export async function GET() {
    try {
        // Auth Guard (§8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const today = new Date().toISOString().split('T')[0];
        const suggestions: PulseSuggestion[] = [];

        // ─── Parallel DB Queries ──────────────────────────────────────
        const [
            { data: pendingJobs },
            { data: cvMatchDoneJobs },
            { data: coverLetterDoneJobs },
            { data: readyToApplyJobs },
            { data: allQueueJobs },
            { data: cvDocuments },
            { data: todayPulseTasks },
        ] = await Promise.all([
            // Jobs with pending status (need Steckbrief confirmation)
            supabaseAdmin
                .from('job_queue')
                .select('id, company_name, job_title')
                .eq('user_id', user.id)
                .eq('status', 'pending')
                .limit(5),

            // Jobs with cv_match_done (need CV Match review)
            supabaseAdmin
                .from('job_queue')
                .select('id, company_name, job_title')
                .eq('user_id', user.id)
                .eq('status', 'cv_match_done')
                .limit(5),

            // Jobs with cover_letter_done (need Cover Letter review)
            supabaseAdmin
                .from('job_queue')
                .select('id, company_name, job_title')
                .eq('user_id', user.id)
                .in('status', ['cover_letter_done', 'ready_for_review'])
                .limit(5),

            // Jobs ready to apply
            supabaseAdmin
                .from('job_queue')
                .select('id, company_name, job_title')
                .eq('user_id', user.id)
                .eq('status', 'ready_to_apply')
                .limit(5),

            // Total job count
            supabaseAdmin
                .from('job_queue')
                .select('id', { count: 'exact' })
                .eq('user_id', user.id)
                .not('status', 'in', '(failed,skipped)'),

            // CV check
            supabaseAdmin
                .from('documents')
                .select('id')
                .eq('user_id', user.id)
                .eq('document_type', 'cv')
                .limit(1),

            // Already-accepted pulse tasks today (Ghost-Suggestion prevention)
            supabaseAdmin
                .from('tasks')
                .select('job_queue_id')
                .eq('user_id', user.id)
                .eq('source', 'pulse')
                .gte('created_at', `${today}T00:00:00.000Z`)
                .lte('created_at', `${today}T23:59:59.999Z`),
        ]);

        // Set of job_queue_ids already accepted today
        const acceptedJobIds = new Set(
            (todayPulseTasks || [])
                .map((t) => t.job_queue_id)
                .filter(Boolean)
        );

        // ─── Rule Engine: State → Suggestions ─────────────────────────

        // Rule 1: No CV uploaded → Blocker
        if (!cvDocuments || cvDocuments.length === 0) {
            suggestions.push({
                id: `pulse-no-cv-${today}`,
                title: 'Lebenslauf hochladen',
                estimated_minutes: 10,
                priority: 'high',
                category: 'setup',
                job_queue_id: null,
                deep_link: '/dashboard/settings',
                icon: 'file-up',
            });
        }

        // Rule 2: Pending Steckbrief
        for (const job of pendingJobs || []) {
            if (acceptedJobIds.has(job.id)) continue;
            const company = job.company_name || job.job_title || 'Unbekannt';
            suggestions.push({
                id: `pulse-steckbrief-${job.id}`,
                title: `Steckbrief für ${company} bestätigen`,
                estimated_minutes: 10,
                priority: 'high',
                category: 'review',
                job_queue_id: job.id,
                deep_link: `/dashboard/job-queue?highlight=${job.id}`,
                icon: 'clipboard-check',
            });
        }

        // Rule 3: CV Match ready for review
        for (const job of cvMatchDoneJobs || []) {
            if (acceptedJobIds.has(job.id)) continue;
            const company = job.company_name || job.job_title || 'Unbekannt';
            suggestions.push({
                id: `pulse-cv-match-${job.id}`,
                title: `CV Match für ${company} reviewen`,
                estimated_minutes: 15,
                priority: 'high',
                category: 'review',
                job_queue_id: job.id,
                deep_link: `/dashboard/job-queue?highlight=${job.id}`,
                icon: 'file-search',
            });
        }

        // Rule 4: Cover Letter ready for review
        for (const job of coverLetterDoneJobs || []) {
            if (acceptedJobIds.has(job.id)) continue;
            const company = job.company_name || job.job_title || 'Unbekannt';
            suggestions.push({
                id: `pulse-cover-letter-${job.id}`,
                title: `Anschreiben für ${company} reviewen`,
                estimated_minutes: 20,
                priority: 'high',
                category: 'review',
                job_queue_id: job.id,
                deep_link: `/dashboard/job-queue?highlight=${job.id}`,
                icon: 'file-text',
            });
        }

        // Rule 5: Ready to apply
        for (const job of readyToApplyJobs || []) {
            if (acceptedJobIds.has(job.id)) continue;
            const company = job.company_name || job.job_title || 'Unbekannt';
            suggestions.push({
                id: `pulse-apply-${job.id}`,
                title: `Bewerbung bei ${company} abschicken`,
                estimated_minutes: 15,
                priority: 'medium',
                category: 'action',
                job_queue_id: job.id,
                deep_link: `/dashboard/job-queue?highlight=${job.id}`,
                icon: 'send',
            });
        }

        // Rule 6: No jobs in queue at all
        const totalInQueue = allQueueJobs?.length ?? 0;
        if (totalInQueue === 0) {
            suggestions.push({
                id: `pulse-search-${today}`,
                title: 'Neue Jobsuche starten',
                estimated_minutes: 20,
                priority: 'medium',
                category: 'action',
                job_queue_id: null,
                deep_link: '/dashboard/job-search',
                icon: 'search',
            });
        }

        // ─── Limit to 5, sorted by priority ──────────────────────────

        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const sortedSuggestions = suggestions
            .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
            .slice(0, 5);

        // ─── Pipeline Summary ─────────────────────────────────────────

        const pendingReviews = (pendingJobs?.length ?? 0)
            + (cvMatchDoneJobs?.length ?? 0)
            + (coverLetterDoneJobs?.length ?? 0);

        return NextResponse.json({
            success: true,
            suggestions: sortedSuggestions,
            pipeline_summary: {
                pending_reviews: pendingReviews,
                ready_to_apply: readyToApplyJobs?.length ?? 0,
                total_in_queue: totalInQueue,
            },
        });
    } catch (error: unknown) {
        console.error('❌ [Pulse] Generate error:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
