import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/documents/download?id=<documentId>
 *
 * Downloads the original uploaded document (CV or Cover Letter) from Supabase Storage.
 * Returns the file as a binary stream with correct Content-Type and Content-Disposition.
 *
 * Contract 2 (SICHERHEITSARCHITEKTUR.md):
 * - CV-Lookup always with .eq('user_id', userId) — enforced via RLS + explicit filter
 * - Storage path never exposed to user
 * Contract 8: Auth Guard mandatory
 */
export async function GET(req: NextRequest) {
    try {
        const documentId = req.nextUrl.searchParams.get('id');
        if (!documentId) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Fetch document metadata (user-scoped — Contract 3)
        const { data: doc, error: docError } = await supabase
            .from('documents')
            .select('id, document_type, file_url_encrypted, metadata')
            .eq('id', documentId)
            .eq('user_id', user.id) // ← PFLICHT (Contract 2+3)
            .single();

        if (docError || !doc) {
            return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
        }

        const storagePath = doc.file_url_encrypted;
        if (!storagePath) {
            return NextResponse.json({ error: 'Kein Speicherpfad vorhanden' }, { status: 404 });
        }

        // 2. Download file from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase
            .storage
            .from('documents')
            .download(storagePath);

        if (downloadError || !fileData) {
            console.error('[documents/download] Storage download failed:', downloadError?.message);
            return NextResponse.json({ error: 'Download fehlgeschlagen' }, { status: 500 });
        }

        // 3. Build filename from metadata (never expose storage path)
        const meta = doc.metadata as Record<string, unknown> | null;
        const originalName = (meta?.original_name as string) || `${doc.document_type}.pdf`;

        // 4. Return as binary stream with correct headers
        const buffer = Buffer.from(await fileData.arrayBuffer());

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${originalName}"`,
                'Content-Length': String(buffer.length),
            },
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[documents/download] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
