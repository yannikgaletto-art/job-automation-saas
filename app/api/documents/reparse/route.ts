export const maxDuration = 60; // Re-parse calls Claude Haiku — needs ~16s budget

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { syncMasterCvFromDocument } from '@/lib/services/cv-master-sync';
import { z } from 'zod';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

const bodySchema = z.object({
    cvDocumentId: z.string().uuid(),
});

/**
 * Welle C (2026-04-27) — User-triggered Re-Parse.
 *
 * Re-parses an existing CV document's extracted_text via parseCvTextToJson
 * (under the hood, syncMasterCvFromDocument with force=true) and rewrites
 * user_profiles.cv_structured_data to reflect the fresh parse.
 *
 * Side-effect: the chosen document becomes the new master CV
 * (cv_original_file_path is updated). This matches the implicit contract from
 * Welle B — when the user explicitly picks a CV, it becomes the master.
 *
 * No new tables, no DB migration. The whole flow is pure file lookup +
 * existing helper invocation.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const { cvDocumentId } = parsed.data;

        // Verify document ownership + type before paying for a re-parse.
        const { data: doc, error: docErr } = await supabase
            .from('documents')
            .select('id, document_type')
            .eq('id', cvDocumentId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (docErr || !doc) {
            return NextResponse.json(
                { success: false, error: 'Document not found or unauthorized' },
                { status: 404 },
            );
        }
        if (doc.document_type !== 'cv') {
            return NextResponse.json(
                { success: false, error: 'Re-parse is only supported for CV documents' },
                { status: 400 },
            );
        }

        const result = await syncMasterCvFromDocument(user.id, cvDocumentId, supabaseAdmin, { force: true });

        if (result.status === 'no-document') {
            return NextResponse.json({ success: false, error: result.message }, { status: 404 });
        }
        if (result.status === 'no-text') {
            return NextResponse.json(
                { success: false, error: 'Document has no extracted text — please re-upload the CV.' },
                { status: 422 },
            );
        }
        if (result.status === 'error') {
            console.error('[reparse] sync failed:', result.message);
            return NextResponse.json({ success: false, error: result.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, status: result.status });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[reparse] unexpected error:', msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
