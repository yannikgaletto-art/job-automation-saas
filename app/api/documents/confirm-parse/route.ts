import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { cvStructuredDataSchema } from '@/types/cv';

/**
 * POST /api/documents/confirm-parse
 *
 * User-Edit-First (2026-04-28): Persists user-confirmed CV structure to
 * user_profiles. The upload + reparse routes parse-only and return the
 * draft structure; this route is the only path that writes
 * cv_structured_data to the profile.
 *
 * Body:
 *   - cvDocumentId: UUID of the CV document the user confirmed against
 *   - confirmedStructure: CvStructuredData the user has reviewed/corrected
 */

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

const bodySchema = z.object({
    cvDocumentId: z.string().uuid(),
    confirmedStructure: cvStructuredDataSchema,
});

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

        const { cvDocumentId, confirmedStructure } = parsed.data;

        // Ownership check (§3 — user-scoped) + read storage path for cv_original_file_path.
        const { data: doc, error: docErr } = await supabaseAdmin
            .from('documents')
            .select('id, document_type, file_url_encrypted')
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
                { success: false, error: 'Confirm-parse is only supported for CV documents' },
                { status: 400 },
            );
        }

        const fullName = confirmedStructure.personalInfo?.name?.trim() || null;

        const { error: profileErr } = await supabaseAdmin
            .from('user_profiles')
            .update({
                cv_structured_data: confirmedStructure,
                cv_original_file_path: doc.file_url_encrypted,
                ...(fullName ? { full_name: fullName } : {}),
            })
            .eq('id', user.id);

        if (profileErr) {
            console.error('[confirm-parse] profile update failed:', profileErr.message);
            return NextResponse.json(
                { success: false, error: 'Failed to save CV: ' + profileErr.message },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[confirm-parse] unexpected error:', msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
