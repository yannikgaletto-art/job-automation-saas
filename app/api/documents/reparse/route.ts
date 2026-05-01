// Vercel timeout: Claude Haiku CV parse can take 15-25s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseCvFromPdf } from '@/lib/services/cv-pdf-parser';
import type { CvStructuredData } from '@/types/cv';

/**
 * POST /api/documents/reparse
 *
 * User-Edit-First (2026-04-28): Re-runs the LLM parse on a CV document's
 * cached extracted_text and RETURNS the parsed JSON for the confirm dialog.
 * Does NOT write user_profiles — the actual save happens in
 * /api/documents/confirm-parse after the user reviews the result.
 */

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

const bodySchema = z.object({
    cvDocumentId: z.string().uuid(),
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
                { success: false, error: 'Invalid request body' },
                { status: 400 },
            );
        }

        const { cvDocumentId } = parsed.data;

        const { data: doc, error: docErr } = await supabaseAdmin
            .from('documents')
            .select('id, document_type, file_url_encrypted, metadata, pii_encrypted')
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

        const filePath = doc.file_url_encrypted as string | undefined;
        if (!filePath) {
            return NextResponse.json(
                { success: false, error: 'Document has no storage path — please re-upload the CV.' },
                { status: 422 },
            );
        }

        const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
            .from('cvs')
            .download(filePath);
        if (dlErr || !pdfBlob) {
            return NextResponse.json(
                { success: false, error: `Failed to download CV from storage: ${dlErr?.message ?? 'unknown'}` },
                { status: 500 },
            );
        }
        const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

        const { structured } = await parseCvFromPdf(pdfBuffer);

        // PII integrity guard — same logic as upload route. Phase-1 PII
        // extraction is more reliable than the parser's general pass.
        const pii = (doc.pii_encrypted as Record<string, unknown>) || {};
        if (pii && Object.keys(pii).length > 0) {
            const { decrypt } = await import('@/lib/utils/encryption');
            if (!structured.personalInfo) structured.personalInfo = {} as any;
            if (pii.name) {
                try { structured.personalInfo.name = decrypt(pii.name as string); } catch { /* keep parsed */ }
            }
            if (!structured.personalInfo.email && pii.email) {
                try { structured.personalInfo.email = decrypt(pii.email as string); } catch { /* keep null */ }
            }
            if (!structured.personalInfo.phone && pii.phone) {
                try { structured.personalInfo.phone = decrypt(pii.phone as string); } catch { /* keep null */ }
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                cv_parsed: structured,
                cv_storage_path: doc.file_url_encrypted,
                document_ids: { cv: doc.id },
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[reparse] unexpected error:', msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
