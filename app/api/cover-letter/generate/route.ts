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

        // ─── B1.4: Auto-Save as Draft ─────────────────────────────────────────
        // Contract 2 (Document Storage Safety): Write → Read-Back → Validate
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: insertData, error: insertError } = await supabase.from('documents').insert({
            user_id: userId,
            document_type: 'cover_letter',
            file_url_encrypted: 'dummy_url', // B1.4 fix: required by DB constraint for generated texts
            metadata: {
                status: 'draft', // B1.4: Every generated CL starts as draft
                job_id: jobId,
                generated_content: result.coverLetter,
                quality_scores: result.finalScores,
                validation: result.finalValidation,
                iterations: result.iterations,
                setup_context: setupContext ?? null,
                cost_cents: result.costCents,
                fluff_warning: result.fluffWarning ?? false,
                xray_annotations: result.annotatedSentences ?? null,     // B4.1
                pipeline_warnings: result.pipelineWarnings ?? [],        // B4.1 (Correction #2)
                pipeline_improved: result.pipelineImproved ?? false,     // B4.1 (Correction #2)
            },
            pii_encrypted: {}
        }).select('id').single();

        let draftId: string | null = null;

        if (insertError) {
            console.error(`[${requestId}] ❌ Failed to save cover letter draft: ${insertError.message}`);
        } else {
            draftId = insertData?.id ?? null;

            // Read-Back Verification (Contract 2: Double-Assurance)
            if (draftId) {
                const { data: readBack } = await supabase
                    .from('documents')
                    .select('id, metadata')
                    .eq('id', draftId)
                    .single();

                if (!readBack || readBack.metadata?.status !== 'draft') {
                    console.error(`[${requestId}] ❌ Read-back verification FAILED for draft ${draftId}`);
                } else {
                    console.log(`[${requestId}] ✅ Draft saved and verified: ${draftId}`);
                }
            }
        }

        return NextResponse.json({
            success: true,
            requestId,
            draft_id: draftId,
            cover_letter: result.coverLetter,
            quality_scores: result.finalScores,
            validation: result.finalValidation,
            iterations: result.iterations,
            iteration_log: result.iterationLog,
            fluff_warning: result.fluffWarning ?? false,
            pipeline_warnings: result.pipelineWarnings ?? [],
            pipeline_improved: result.pipelineImproved ?? false,
            // B4.1: xray_annotations persisted in draft metadata
            annotated_sentences: result.annotatedSentences ?? [],  // B3.1
            hiring_personas: result.hiringPersonas ?? [],          // B3.2
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ route=cover-letter/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
