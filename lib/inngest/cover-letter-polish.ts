/**
 * Inngest Function: cover-letter/polish
 * Asynchronous polish pipeline — runs AFTER the synchronous cover letter generation.
 *
 * Steps (post-refactoring 2026-04-09):
 *   1. JSONB Merge-Update on documents.metadata (polish_status, audit trail)
 *
 * REMOVED Steps:
 *   - Anti-Fluff Re-Gen: Moved to sync-loop feedback (cover-letter-generator.ts)
 *   - Multi-Agent Pipeline: Deprecated — Haiku overwriting Sonnet = quality regression
 *   - Perplexity Fact Check: Removed 2026-03-30 (Phase 2)
 *
 * CRITICAL K2-FIX: This job NEVER overwrites `generated_content`.
 * The user may have edited the letter between generation and polish completion.
 * Overwriting would silently destroy user edits (Lost Edit bug).
 *
 * Reference: Implementation Plan Phase 1b (K2-Fix)
 * Contract: §ARCHITECTURE 3.1 (Inngest Resilience)
 */

import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ─── Event Type (simplified — no longer needs full coverLetter/companyResearch) ──
interface PolishEventData {
    draftId: string;
    userId: string;
    fluffFound: boolean;
    locale?: string;
    // coverLetter and companyResearch removed — polish no longer processes content
}



// ─── Main Pipeline ───────────────────────────────────────────────────────
export const polishCoverLetter = inngest.createFunction(
    {
        id: 'cover-letter-polish',
        name: 'Cover Letter Polish Pipeline',
        retries: 1,
    },
    { event: 'cover-letter/polish' },
    async ({ event, step }) => {
        const {
            draftId,
            userId,
            fluffFound,
        } = event.data as PolishEventData;

        const supabase = getSupabaseAdmin();
        const polishWarnings: string[] = [];

        console.log(`[Polish] Starting for draft=${draftId} user=${userId.substring(0, 8)}…`);

        // ── Verify draft exists (NonRetriableError if not) ────────────
        const { data: draft, error: draftErr } = await supabase
            .from('documents')
            .select('id')
            .eq('id', draftId)
            .eq('user_id', userId)
            .single();

        if (draftErr || !draft) {
            throw new NonRetriableError(`Draft ${draftId} not found for user — aborting polish`);
        }

        // Note on removed steps:
        // Step 1 (Anti-Fluff Re-Gen): Fluff feedback is now injected into the sync-loop
        // in cover-letter-generator.ts. If the validator detects fluff AND the judge fails,
        // the fluff matches go into the feedback[] array for the next iteration.
        //
        // Step 2 (Multi-Agent Pipeline): Deprecated. The Haiku language judge was
        // overwriting Sonnet-quality text with Haiku-quality rewrites = quality regression.
        // The sync-loop Judge already catches all hard-constraint violations.

        if (fluffFound) {
            polishWarnings.push('Fluff-Patterns erkannt — wurden im Sync-Loop adressiert.');
        }

        // ── JSONB Merge-Update on documents.metadata ─────────────────
        await step.run('save-polish-metadata', async () => {
            // Read current metadata first (JSONB merge, not overwrite)
            const { data: currentDoc } = await supabase
                .from('documents')
                .select('metadata')
                .eq('id', draftId)
                .eq('user_id', userId)
                .single();

            if (!currentDoc) {
                throw new NonRetriableError(`Draft ${draftId} disappeared during polish`);
            }

            const existingMeta = (currentDoc.metadata || {}) as Record<string, unknown>;

            // K2-FIX: NEVER write generated_content here.
            // The user may have edited the letter between generation and this async job.
            // Overwriting would silently destroy user edits.
            const updatedMeta = {
                ...existingMeta,
                polish_status: 'done',
                polish_improved: false, // No content changes — just audit trail
                polish_warnings: polishWarnings.length > 0 ? polishWarnings : undefined,
                pipeline_improved: false,
                pipeline_warnings: polishWarnings.length > 0 ? polishWarnings : undefined,
                polished_at: new Date().toISOString(),
            };

            const { error: updateErr } = await supabase
                .from('documents')
                .update({ metadata: updatedMeta })
                .eq('id', draftId)
                .eq('user_id', userId);

            if (updateErr) {
                throw new Error(`Failed to save polished draft: ${updateErr.message}`);
            }

            console.log(`[Polish] ✅ Draft ${draftId} updated — metadata only, no content overwrite`);
        });

        return {
            success: true,
            draftId,
            polishImproved: false,
            polishWarnings,
        };
    }
);
