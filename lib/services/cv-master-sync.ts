/**
 * CV Master Sync — Welle Re-1 LITE (2026-04-27).
 *
 * SSoT helper for "the user picked CV-X for this match → make CV-X the master".
 * Used by both DEV (app/api/cv/match/route.ts) and PROD (lib/inngest/cv-match-pipeline.ts)
 * to guarantee identical behavior. Eliminates the DEV/PROD-Drift that caused
 * the PwC E2E bug (master held EN-CV data while picker chose Exxeta).
 *
 * Contract:
 *   - Idempotent: if profile.cv_original_file_path already === doc.file_url_encrypted,
 *     it returns "skipped" without re-parsing.
 *   - Re-parses extracted_text with parseCvTextToJson when sync is needed.
 *   - Restores user_profiles.full_name into structuredCv.personalInfo.name
 *     (Tier 1 name override — prevents OCR-header names leaking into re-parsed CVs).
 *   - Non-blocking: returns SyncResult with status; never throws on missing doc.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CvMasterSyncStatus =
    | 'synced'        // master rewritten with chosen doc's structured data
    | 'skipped'       // master already pointed to chosen doc — no work needed
    | 'no-document'   // chosen doc id not found
    | 'no-text'       // chosen doc has no extracted_text to re-parse
    | 'error';        // any other failure (logged, non-blocking)

export interface SyncResult {
    status: CvMasterSyncStatus;
    message?: string;
}

/**
 * Sync the user's master CV (`user_profiles.cv_structured_data`) to reflect
 * the document the user explicitly chose at match time.
 *
 * Returns a SyncResult — caller logs but does not throw on failure
 * (the match pipeline is more important than this side-effect).
 */
export async function syncMasterCvFromDocument(
    userId: string,
    cvDocumentId: string,
    supabaseAdmin: SupabaseClient,
): Promise<SyncResult> {
    try {
        const [{ data: profile }, { data: doc }] = await Promise.all([
            supabaseAdmin
                .from('user_profiles')
                .select('cv_original_file_path, full_name')
                .eq('id', userId)
                .maybeSingle(),
            supabaseAdmin
                .from('documents')
                .select('file_url_encrypted, metadata')
                .eq('id', cvDocumentId)
                .eq('user_id', userId)
                .maybeSingle(),
        ]);

        if (!doc) {
            return { status: 'no-document', message: `Document ${cvDocumentId} not found for user` };
        }

        if (profile?.cv_original_file_path === doc.file_url_encrypted) {
            return { status: 'skipped', message: 'Profile already synced with chosen document' };
        }

        const extractedText = (doc.metadata as Record<string, unknown> | null)?.extracted_text as string | undefined;
        if (!extractedText || extractedText.trim().length < 50) {
            return { status: 'no-text', message: `Document ${cvDocumentId} has no usable extracted_text` };
        }

        const { parseCvTextToJson } = await import('@/lib/services/cv-parser');
        const structuredCv = await parseCvTextToJson(extractedText);

        if (profile?.full_name) {
            const piRecord = (structuredCv as { personalInfo?: Record<string, unknown> }).personalInfo
                ?? ((structuredCv as { personalInfo?: Record<string, unknown> }).personalInfo = {} as Record<string, unknown>);
            piRecord.name = profile.full_name;
        }

        const { error: updateErr } = await supabaseAdmin
            .from('user_profiles')
            .update({
                cv_structured_data: structuredCv,
                cv_original_file_path: doc.file_url_encrypted,
            })
            .eq('id', userId);

        if (updateErr) {
            return { status: 'error', message: `Profile update failed: ${updateErr.message}` };
        }

        return { status: 'synced' };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: 'error', message: msg };
    }
}
