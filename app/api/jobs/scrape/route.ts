import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scrapeJob } from '@/lib/services/job-scraper';
import { checkDuplicateApplication } from '@/lib/services/application-history';
import { z } from 'zod';
import crypto from 'crypto';

// Admin client for bypassing RLS on job_queue insert
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const ScrapeRequestSchema = z.object({
    jobUrl: z.string().url('Invalid URL format'),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // ================================================================
        // STEP 0: Authenticate user via session
        // ================================================================
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const userId = user.id;

        // ================================================================
        // STEP 1: Validate input
        // ================================================================
        const body = await request.json();
        const { jobUrl, company, jobTitle } = ScrapeRequestSchema.parse(body);

        console.log(`🔍 [Job Scrape] User ${userId.substring(0, 8)}... scraping: ${jobUrl.substring(0, 80)}`);

        // ================================================================
        // STEP 2: Check for duplicates BEFORE scraping (save API costs)
        // ================================================================
        const slugify = (text: string) =>
            text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        try {
            const duplicateResult = await checkDuplicateApplication(
                userId,
                jobUrl,
                company ? slugify(company) : undefined,
                jobTitle
            );

            if (duplicateResult.isDuplicate) {
                console.warn(`⚠️ Blocked duplicate: ${duplicateResult.reason}`);
                return NextResponse.json(
                    { success: false, error: 'DUPLICATE_APPLICATION', details: duplicateResult },
                    { status: 409 }
                );
            }
        } catch (dupError) {
            // Non-blocking: if duplicate check fails, proceed with scraping
            console.warn('⚠️ Duplicate check failed, proceeding:', dupError);
        }

        // ================================================================
        // STEP 3: Scrape job data (5-tier fallback)
        // ================================================================
        const scrapeResult = await scrapeJob(jobUrl);

        if (!scrapeResult.success || !scrapeResult.data) {
            console.error(`❌ Scraping failed: ${scrapeResult.error}`);
            return NextResponse.json(
                {
                    success: false,
                    error: scrapeResult.error || 'Scraping failed',
                    method: scrapeResult.method,
                    duration: scrapeResult.duration,
                },
                { status: 422 }
            );
        }

        const jobData = scrapeResult.data;
        console.log(`✅ Scraped: "${jobData.title}" at ${jobData.company} via ${scrapeResult.method}`);

        // ================================================================
        // STEP 4: Check if user_profiles row exists (required FK)
        // ================================================================
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!profile) {
            // Create minimal profile if missing
            await supabaseAdmin.from('user_profiles').insert({
                id: userId,
                pii_encrypted: Buffer.from('{}'),
                onboarding_completed: false,
            });
            console.log('📝 Created missing user_profiles row');
        }

        // ================================================================
        // STEP 5: Insert job into queue
        // ================================================================
        const urlHash = crypto.createHash('md5').update(jobUrl).digest('hex');

        // Check if this URL is already in the queue for this user
        const { data: existingJob } = await supabaseAdmin
            .from('job_queue')
            .select('id, status')
            .eq('user_id', userId)
            .eq('job_url', jobUrl)
            .single();

        if (existingJob) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Dieser Job ist bereits in deiner Queue.',
                    existingJobId: existingJob.id,
                    existingStatus: existingJob.status,
                },
                { status: 409 }
            );
        }

        const { data: job, error: insertError } = await supabaseAdmin
            .from('job_queue')
            .insert({
                user_id: userId,
                job_url: jobUrl,
                job_title: jobData.title,
                company: jobData.company,
                location: jobData.location || null,
                salary_range: jobData.salary || null,
                description: jobData.description,
                requirements: jobData.requirements || null,
                platform: jobData.platform,
                snapshot_at: new Date().toISOString(),
                status: 'pending',
                user_profile_id: userId,
            })
            .select('id, job_title, company, location, platform, status, created_at')
            .single();

        if (insertError) {
            console.error('❌ DB insert failed:', insertError);
            return NextResponse.json(
                { success: false, error: `Database error: ${insertError.message}` },
                { status: 500 }
            );
        }

        console.log(`💾 Job queued (ID: ${job.id}) via ${scrapeResult.method} in ${Date.now() - startTime}ms`);

        // ================================================================
        // STEP 6: Return success
        // ================================================================
        return NextResponse.json(
            {
                success: true,
                job: {
                    id: job.id,
                    title: job.job_title,
                    company: job.company,
                    location: job.location,
                    platform: job.platform,
                    status: job.status,
                },
                scraping: {
                    method: scrapeResult.method,
                    duration: scrapeResult.duration,
                    cost: scrapeResult.cost / 100, // cents → dollars
                },
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        console.error('❌ Scrape API error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.errors },
                { status: 400 }
            );
        }

        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { success: false, error: errMsg },
            { status: 500 }
        );
    }
}
