import crypto from 'crypto';
import { generateCoverLetterWithQuality } from '@/lib/services/cover-letter-generator';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        const { userId, jobId, setupContext, fixMode, targetFix, currentLetter } = await request.json() as {
            userId: string;
            jobId: string;
            setupContext?: CoverLetterSetupContext;
            fixMode?: 'full' | 'targeted';
            targetFix?: string;
            currentLetter?: string;
        };

        console.log(`[${requestId}] route=cover-letter/generate step=start userId=${userId ?? 'anon'} jobId=${jobId ?? 'none'} fixMode=${fixMode || 'full'}`);

        if (!userId || !jobId) {
            return NextResponse.json({ error: 'Missing userId or jobId', requestId }, { status: 400 });
        }

        if (!setupContext && fixMode !== 'targeted') {
            console.warn(`[${requestId}] ⚠️ No setupContext provided — generation quality will be reduced`);
        }

        const result = await generateCoverLetterWithQuality(jobId, userId, setupContext, fixMode, targetFix, currentLetter);

        console.log(`[${requestId}] step=complete iterations=${result.iterations} score=${result.finalScores?.overall_score ?? 'N/A'} cost=${result.costCents}¢`);

        // Store result + setup_context as audit trail
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: insertError } = await supabase.from('documents').insert({
            user_id: userId,
            document_type: 'cover_letter',
            metadata: {
                job_id: jobId,
                generated_content: result.coverLetter,
                quality_scores: result.finalScores,
                validation: result.finalValidation,
                iterations: result.iterations,
                setup_context: setupContext ?? null,
                cost_cents: result.costCents,
            },
            pii_encrypted: {}
        });

        if (insertError) {
            console.error(`[${requestId}] ❌ Failed to save cover letter: ${insertError.message}`);
        }

        return NextResponse.json({
            success: true,
            requestId,
            cover_letter: result.coverLetter,
            quality_scores: result.finalScores,
            validation: result.finalValidation,
            iterations: result.iterations,
            iteration_log: result.iterationLog,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ route=cover-letter/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
