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
    try {
        const body = await req.json();
        const { userId, jobId } = body;

        if (!userId || !jobId) {
            return NextResponse.json(
                { error: 'Missing userId or jobId' },
                { status: 400 }
            );
        }

        // 0. Rate Limiting Check
        if (ratelimit) {
            const { success, remaining } = await ratelimit.limit(`cv_optimize:${userId}`);
            if (!success) {
                console.warn(`🛑 Rate limit exceeded for user ${userId}`);
                return NextResponse.json(
                    { error: 'Rate limit exceeded. Try again in 1 hour.' },
                    { status: 429 }
                );
            }
            console.log(`💾 Rate limit: ${remaining} optimizations remaining for user ${userId}`);
        } else {
            console.warn('⚠️ No Rate Limiter configured (Dev Mode)');
        }

        // 1. Fetch user's CV
        const { data: cvDoc, error: cvError } = await supabase
            .from('documents')
            .select('id, metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cv')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (cvError || !cvDoc) {
            console.error('CV fetch error:', cvError);
            return NextResponse.json(
                { error: 'CV not found for user. Please upload a CV first.' },
                { status: 404 }
            );
        }

        // 2. Extract CV Text
        // Strategy: Try `metadata.extracted_text` first (fastest/cheapest)
        // If missing (legacy docs), we might need to re-process (omitted for MVP speed)
        const cvText = cvDoc.metadata?.extracted_text || '';

        if (!cvText || cvText.length < 50) {
            return NextResponse.json(
                { error: 'CV content is empty or unreadable. Please re-upload your CV.' },
                { status: 400 }
            );
        }

        // 3. Fetch job details
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            return NextResponse.json(
                { error: 'Job not found' },
                { status: 404 }
            );
        }

        // 4. Optimize CV
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
        // Append to history or update 'last_optimization'
        const updatedMetadata = {
            ...cvDoc.metadata,
            last_optimization: {
                timestamp: new Date().toISOString(),
                job_id: jobId,
                ats_score: result.atsScore,
                changes_summary: result.changesLog,
                // We DON'T store the full optimized markup here to keep metadata light?
                // Actually, storing it allows "Show last optimization" feature without re-gen.
                // Let's store it.
                optimized_cv_preview: result.optimizedCV.substring(0, 1000) + '...', // Store preview?
                // Or store full? Metadata limit is 100MB+ usually. Text is small (5KB).
                // Let's store full it's fine.
                optimized_cv_full: result.optimizedCV
            }
        };

        const { error: updateError } = await supabase
            .from('documents')
            .update({ metadata: updatedMetadata })
            .eq('id', cvDoc.id);

        if (updateError) {
            console.error('Failed to save optimization result:', updateError);
            // Non-blocking error, still return result to UI
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('CV Optimization Route Error:', error);

        // Return partial result if possible (Graceful degradation)
        // For now, simple error
        return NextResponse.json(
            { error: 'Optimization failed', details: error.message },
            { status: 500 }
        );
    }
}
