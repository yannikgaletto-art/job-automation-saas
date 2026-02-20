import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { optimizeCV } from '@/lib/services/cv-optimizer';
import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Supabase Client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Rate Limiter (Optional - only if Env vars exist)
const ratelimit = process.env.UPSTASH_REDIS_REST_URL
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 optimizations per hour
        analytics: true,
    })
    : null;

export async function POST(req: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        const body = await req.json();
        const { userId, jobId } = body;

        console.log(`[${requestId}] route=cv/optimize step=start userId=${userId ?? 'anon'} jobId=${jobId ?? 'none'}`);

        if (!userId || !jobId) {
            return NextResponse.json(
                { error: 'Missing userId or jobId', requestId },
                { status: 400 }
            );
        }

        // 0. Rate Limiting Check
        if (ratelimit) {
            const { success, remaining } = await ratelimit.limit(`cv_optimize:${userId}`);
            if (!success) {
                console.warn(`[${requestId}] route=cv/optimize step=rate_limit_exceeded`);
                return NextResponse.json(
                    { error: 'Rate limit exceeded. Try again in 1 hour.', requestId },
                    { status: 429 }
                );
            }
            console.log(`[${requestId}] route=cv/optimize step=rate_limit_ok remaining=${remaining}`);
        } else {
            console.warn(`[${requestId}] route=cv/optimize step=rate_limit_skipped reason=dev_mode`);
        }

        // 1. Fetch user's CV
        console.log(`[${requestId}] route=cv/optimize step=db_fetch_cv`);
        const { data: cvDoc, error: cvError } = await supabase
            .from('documents')
            .select('id, metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cv')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (cvError || !cvDoc) {
            console.error(`[${requestId}] route=cv/optimize step=db_fetch_cv supabase_error=${cvError?.message} code=${cvError?.code}`);
            return NextResponse.json(
                { error: 'CV not found for user. Please upload a CV first.', requestId },
                { status: 404 }
            );
        }

        // 2. Extract CV Text
        const cvText = cvDoc.metadata?.extracted_text || '';

        if (!cvText || cvText.length < 50) {
            return NextResponse.json(
                { error: 'CV content is empty or unreadable. Please re-upload your CV.', requestId },
                { status: 400 }
            );
        }

        // 3. Fetch job details
        console.log(`[${requestId}] route=cv/optimize step=db_fetch_job`);
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            console.error(`[${requestId}] route=cv/optimize step=db_fetch_job supabase_error=${jobError?.message} code=${jobError?.code}`);
            return NextResponse.json(
                { error: 'Job not found', requestId },
                { status: 404 }
            );
        }

        // 4. Optimize CV
        console.log(`[${requestId}] route=cv/optimize step=optimize`);
        const result = await optimizeCV({
            userId,
            jobId,
            cvText,
            jobTitle: job.job_title || 'Target Role',
            jobRequirements: Array.isArray(job.requirements)
                ? job.requirements
                : (typeof job.requirements === 'string' ? [job.requirements] : []),
            jobDescription: job.description || '',
        });

        // 5. Store Result in Document Metadata
        console.log(`[${requestId}] route=cv/optimize step=db_update_cv_metadata`);
        const updatedMetadata = {
            ...cvDoc.metadata,
            last_optimization: {
                timestamp: new Date().toISOString(),
                job_id: jobId,
                ats_score: result.atsScore,
                changes_summary: result.changesLog,
                optimized_cv_full: result.optimizedCV
            }
        };

        const { error: updateError } = await supabase
            .from('documents')
            .update({ metadata: updatedMetadata })
            .eq('id', cvDoc.id);

        if (updateError) {
            console.error(`[${requestId}] route=cv/optimize step=db_update_cv_metadata supabase_error=${updateError.message} code=${updateError.code}`);
            // Non-blocking error, still return result to UI
        }

        console.log(`[${requestId}] route=cv/optimize step=complete ats_score=${result.atsScore}`);
        return NextResponse.json({ ...result, requestId });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] route=cv/optimize step=unhandled_error error=${errMsg}`);

        return NextResponse.json(
            { error: 'Optimization failed', details: errMsg, requestId },
            { status: 500 }
        );
    }
}
