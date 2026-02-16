import { generateCoverLetterWithQuality } from '@/lib/services/cover-letter-generator';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { userId, jobId } = await request.json();

        if (!userId || !jobId) {
            return NextResponse.json(
                { error: 'Missing userId or jobId' },
                { status: 400 }
            );
        }

        // Use quality loop with validation (max 3 iterations)
        const result = await generateCoverLetterWithQuality(jobId, userId);

        return NextResponse.json({
            success: true,
            cover_letter: result.coverLetter,
            quality_scores: result.finalScores,
            validation: result.finalValidation, // NEW: Validation results for frontend
            iterations: result.iterations,
            iteration_log: result.iterationLog // Optional: useful for debugging/frontend details
        });

    } catch (error: any) {
        console.error("Cover letter generation failed:", error);
        return NextResponse.json(
            { error: error.message || "Generation failed" },
            { status: 500 }
        );
    }
}
