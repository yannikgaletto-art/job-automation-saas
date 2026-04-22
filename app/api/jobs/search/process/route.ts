export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Required for Vercel Pro — pipeline can take 25-35s

/**
 * POST /api/jobs/search/process
 * Deep pipeline: Jina Reader → Claude Haiku Harvester → Claude Judge
 * Processes a single job and saves to job_queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
    deepScrapeJob,
    fetchSerpApiFullDescription,
    harvestJobData,
    judgeJob,
    getDefaultUserValues,
    type SerpApiJob,
    type UserValues,
} from '@/lib/services/job-search-pipeline';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // Auth
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const rateLimited = await checkUpstashLimit(rateLimiters.jobSearchProcess, user.id);
        if (rateLimited) return rateLimited;

        const body = await request.json();
        const { serpApiJob, searchQuery } = body as {
            serpApiJob: SerpApiJob;
            searchQuery: string;
        };

        if (!serpApiJob?.title || !serpApiJob?.company_name) {
            return NextResponse.json({ error: 'Invalid job data' }, { status: 400 });
        }

        console.log(`✅ [Process] Starting pipeline for: ${serpApiJob.title} @ ${serpApiJob.company_name}`);

        // ─── Max 5 active jobs per user (§12.5: pending_review excluded) ─
        const { count: activeJobCount } = await supabaseAdmin
            .from('job_queue')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('status', 'in', '("archived","rejected","submitted")');

        if ((activeJobCount ?? 0) >= 5) {
            return NextResponse.json(
                { success: false, error: 'Max. 5 aktive Jobs erreicht. Bitte schliesse bestehende Jobs ab oder loesche sie.' },
                { status: 429 }
            );
        }

        // ─── Duplicate check ────────────────────────────────────────
        const { data: existing } = await supabaseAdmin
            .from('job_queue')
            .select('id')
            .eq('user_id', user.id)
            .eq('job_title', serpApiJob.title)
            .eq('company_name', serpApiJob.company_name)
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
            .limit(1);

        if (existing && existing.length > 0) {
            console.log(`⚠️ [Process] Duplicate detected, returning existing job`);
            return NextResponse.json({
                success: true,
                job: existing[0],
                duplicate: true,
            });
        }

        // ─── §12.5 Step 1: SerpAPI full description (PRIMARY SOURCE) ─
        // Google's description is GUARANTEED to match the displayed job title.
        const jobId = (serpApiJob.raw as any)?.job_id;
        const serpApiFullDesc = await fetchSerpApiFullDescription(
            jobId, process.env.SERPAPI_KEY
        );

        // ─── §12.5 Step 1b: Jina Reader (ENRICHMENT) ────────────────
        // Only scrape if we have a direct apply link (not LinkedIn/Google redirect).
        // Jina adds extra detail but is NOT the primary source.
        const jinaMarkdown = serpApiJob.apply_link
            ? await deepScrapeJob(serpApiJob.apply_link)
            : null;

        // ─── §12.3 Verification Guard: Expired ──────────────────────
        if (jinaMarkdown === '__EXPIRED__') {
            console.warn(`⚠️ [Process] Job expired: ${serpApiJob.title} @ ${serpApiJob.company_name}`);
            return NextResponse.json({
                success: false,
                reason: 'expired',
                message: 'Diese Stelle ist leider nicht mehr verfügbar.',
            });
        }

        // ─── §12.5 Step 2: Claude Haiku Harvester ────────────────────
        // SerpAPI = Ground Truth, Jina = Enrichment
        const primaryDescription = serpApiFullDesc || serpApiJob.description;
        const harvested = await harvestJobData(
            jinaMarkdown || '',
            primaryDescription,
        );

        // ─── §12.3 Verification Guard: Company Mismatch ─────────────
        // Simple substring check (no Levenshtein — "Reduce Complexity")
        if (harvested?.company_name) {
            const expected = serpApiJob.company_name.toLowerCase().trim();
            const actual = harvested.company_name.toLowerCase().trim();
            // Neither contains the other → completely different company
            const isMatch = expected.includes(actual) || actual.includes(expected);
            if (!isMatch) {
                console.warn(`⚠️ [Process] Company mismatch: expected "${serpApiJob.company_name}", got "${harvested.company_name}"`);
                return NextResponse.json({
                    success: false,
                    reason: 'mismatch',
                    message: `Der Link führt zu einer Stelle bei "${harvested.company_name}" statt bei "${serpApiJob.company_name}". Der Job wurde nicht hinzugefügt.`,
                });
            }
        }

        // ─── Step 3: Claude Judge ───────────────────────────────────
        // Fetch user values (or use defaults)
        let userValues: UserValues = getDefaultUserValues();
        const { data: uv } = await supabaseAdmin
            .from('user_values')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (uv) {
            userValues = {
                experience_level: uv.experience_level,
                company_values: uv.company_values || [],
                preferred_org_type: uv.preferred_org_type || [],
                diversity_important: uv.diversity_important ?? false,
                sustainability_important: uv.sustainability_important ?? false,
                leadership_style_pref: uv.leadership_style_pref,
                innovation_level_pref: uv.innovation_level_pref,
                purpose_keywords: uv.purpose_keywords || [],
            };
        }

        const judgeResult = harvested ? await judgeJob(harvested, userValues) : null;

        // ─── Step 4: Ensure user_profiles exists ────────────────────
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (!profile) {
            await supabaseAdmin.from('user_profiles').insert({
                id: user.id,
                pii_encrypted: {},
                onboarding_completed: false,
            });
        }

        // ─── Step 5: Insert into job_queue ───────────────────────────
        const jobData = {
            user_id: user.id,
            user_profile_id: user.id,
            job_url: serpApiJob.apply_link || `search:${Date.now()}`,
            job_title: serpApiJob.title,
            company_name: serpApiJob.company_name,
            location: harvested?.location || serpApiJob.location || null,
            description: serpApiJob.description,
            platform: 'unknown',
            source: 'job_search',
            search_query: searchQuery,
            source_url: serpApiJob.apply_link || null,
            apply_link: serpApiJob.apply_link || null,
            serpapi_raw: serpApiJob.raw || null,
            firecrawl_markdown: jinaMarkdown, // Legacy column name — now stores Jina Reader output (renamed too risky)
            salary_range: harvested?.salary_range || serpApiJob.detected_extensions?.salary || null,
            status: 'pending_review', // §12.5: User must confirm Steckbrief before queue
            snapshot_at: new Date().toISOString(),
            // Harvester fields
            work_model: harvested?.work_model || (serpApiJob.detected_extensions?.work_from_home ? 'remote' : 'unknown'),
            contract_type: harvested?.contract_type || 'unknown',
            experience_years_min: harvested?.experience_years_min || null,
            experience_years_max: harvested?.experience_years_max || null,
            experience_level_stated: harvested?.experience_level_stated || 'unknown',
            hard_requirements: harvested?.hard_requirements || null,
            soft_requirements: harvested?.soft_requirements || null,
            tasks: harvested?.tasks || null,
            requirements: harvested?.hard_requirements || null,
            responsibilities: harvested?.tasks || null,
            benefits: harvested?.benefits_and_perks || [],
            buzzwords: harvested?.ats_keywords || null,
            about_company_raw: harvested?.about_company_raw || null,
            mission_statement_raw: harvested?.mission_statement_raw || null,
            diversity_section_raw: harvested?.diversity_section_raw || null,
            sustainability_section_raw: harvested?.sustainability_section_raw || null,
            leadership_signals_raw: harvested?.leadership_signals_raw || null,
            tech_stack_mentioned: harvested?.tech_stack_mentioned || null,
            ats_keywords: harvested?.ats_keywords || null,
            application_deadline: harvested?.application_deadline || null,
            // Judge fields
            match_score_overall: judgeResult?.match_score_overall || null,
            score_breakdown: judgeResult?.score_breakdown || null,
            judge_reasoning: judgeResult?.judge_reasoning || null,
            recommendation: judgeResult?.recommendation || null,
            red_flags: judgeResult?.red_flags || null,
            green_flags: judgeResult?.green_flags || null,
            knockout_reason: judgeResult?.knockout_reason || null,
        };

        const { data: insertedJob, error: insertError } = await supabaseAdmin
            .from('job_queue')
            .insert(jobData)
            .select('id, job_title, company_name, match_score_overall, recommendation, status')
            .single();

        if (insertError) {
            // Graceful duplicate handling via unique constraint
            if (insertError.code === '23505') {
                console.log(`⚠️ [Process] Duplicate via constraint, source_url=${serpApiJob.apply_link}`);
                return NextResponse.json({ success: true, duplicate: true });
            }
            console.error(`❌ [Process] DB insert error: message=${insertError.message} code=${insertError.code} details=${JSON.stringify(insertError.details)} hint=${insertError.hint}`);
            return NextResponse.json({ error: 'Database error', details: insertError.message }, { status: 500 });
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [Process] Complete in ${duration}ms: ${insertedJob.job_title} (score: ${insertedJob.match_score_overall})`);

        return NextResponse.json({
            success: true,
            job: {
                ...insertedJob,
                // §12.5 Preview data — sent to SteckbriefPreviewModal
                tasks: harvested?.tasks || [],
                hard_requirements: harvested?.hard_requirements || [],
                soft_requirements: harvested?.soft_requirements || [],
                benefits: harvested?.benefits_and_perks || [],
                ats_keywords: harvested?.ats_keywords || [],
                score_breakdown: judgeResult?.score_breakdown || null,
                judge_reasoning: judgeResult?.judge_reasoning || null,
                red_flags: judgeResult?.red_flags || [],
                green_flags: judgeResult?.green_flags || [],
                knockout_reason: judgeResult?.knockout_reason || null,
                work_model: harvested?.work_model || 'unknown',
                location: harvested?.location || serpApiJob.location || null,
            },
            pipeline: {
                serpapi_full: !!serpApiFullDesc,
                jina: !!jinaMarkdown,
                harvester: !!harvested,
                judge: !!judgeResult,
                duration_ms: duration,
            },
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Process] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
