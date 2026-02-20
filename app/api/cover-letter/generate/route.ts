import crypto from 'crypto';
import { generateCoverLetterWithQuality } from '@/lib/services/cover-letter-generator';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        const { userId, jobId } = await request.json();

        console.log(`[${requestId}] route=cover-letter/generate step=start userId=${userId ?? 'anon'} jobId=${jobId ?? 'none'}`);

        if (!userId || !jobId) {
            return NextResponse.json(
                { error: 'Missing userId or jobId', requestId },
                { status: 400 }
            );
        }

        console.log(`[${requestId}] route=cover-letter/generate step=generate_with_quality`);

        // Use quality loop with validation (max 3 iterations)
        const result = await generateCoverLetterWithQuality(jobId, userId);

        console.log(`[${requestId}] route=cover-letter/generate step=complete iterations=${result.iterations} score=${result.finalScores?.overall_score ?? 'N/A'}`);

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
        console.error(`[${requestId}] route=cover-letter/generate step=unhandled_error error=${errMsg}`);
        return NextResponse.json(
            { error: errMsg || 'Generation failed', requestId },
            { status: 500 }
        );
    }
}
