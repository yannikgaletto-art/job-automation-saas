export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    },
);

/**
 * DELETE /api/documents/[id]
 *
 * Order of operations under the Single-CV invariant (Phase 3):
 *   1. Audit log (DSGVO Art. 5(1)(f) Accountability).
 *   2. Verify ownership.
 *   3. For CVs: clear user_profiles.cv_* fields BEFORE deleting the row,
 *      so we never end up with a profile pointer that resolves to nothing.
 *   4. Delete the documents row.
 *   5. Best-effort storage cleanup; storage failures do NOT fail the
 *      request because the row is already gone — orphan files are
 *      reaped by scripts/_cleanup-orphan-cv-storage.ts.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        // 1. Audit log — runs before any state change.
        console.log(
            `[audit] cv-delete user=${user.id} doc=${id} at=${new Date().toISOString()}`,
        );

        // 2. Fetch + ownership check.
        const { data: document, error: fetchError } = await supabase
            .from('documents')
            .select('id, document_type, file_url_encrypted')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !document) {
            console.error('Document not found or unauthorized:', fetchError?.message);
            return NextResponse.json(
                { success: false, error: 'Document not found or unauthorized' },
                { status: 404 },
            );
        }

        const bucketName = document.document_type === 'cv' ? 'cvs' : 'cover-letters';
        const filePath = document.file_url_encrypted;

        // 3. CV-only: clear master pointer + structured data first. Idempotent.
        // We clear before the row delete so a half-failed delete cannot leave
        // the profile pointing at a row that no longer exists.
        if (document.document_type === 'cv') {
            const { error: profileErr } = await supabaseAdmin
                .from('user_profiles')
                .update({
                    cv_structured_data: null,
                    cv_original_file_path: null,
                })
                .eq('id', user.id);

            if (profileErr) {
                console.error(`[cv-delete] profile clear failed user=${user.id}:`, profileErr.message);
                return NextResponse.json(
                    { success: false, error: 'Failed to clear profile master pointer' },
                    { status: 500 },
                );
            }
        }

        // 4. Delete the documents row.
        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (deleteError) {
            console.error(`[cv-delete] db delete failed doc=${id}:`, deleteError.message);
            return NextResponse.json(
                { success: false, error: 'Failed to delete document record' },
                { status: 500 },
            );
        }

        // 5. Storage cleanup — best-effort. Orphans reaped offline.
        if (filePath) {
            const { error: storageError } = await supabaseAdmin.storage
                .from(bucketName)
                .remove([filePath]);

            if (storageError) {
                console.warn(
                    `[cv-delete] storage cleanup failed (non-blocking) ${bucketName}/${filePath}:`,
                    storageError.message,
                );
            }
        }

        console.log(`[cv-delete] success doc=${id} user=${user.id}`);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[cv-delete] server error:', errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
}
