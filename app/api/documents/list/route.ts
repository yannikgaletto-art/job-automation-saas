export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const { data: documents, error } = await supabase
            .from('documents')
            .select('id, document_type, created_at, file_url_encrypted, metadata')
            .eq('user_id', user.id)
            // §Settings-Gate: Exclude AI-generated cover letters — they live exclusively
            // in the Job Queue (step-4-cover-letter). Settings shows ONLY user-uploaded docs.
            // NULL-safe: .neq() in Supabase/Postgres evaluates NULL != 'generated' as NULL (not TRUE),
            // which silently drops all rows where origin IS NULL (= all uploaded CVs).
            // Fix: explicitly include rows where origin is NULL (uploaded docs) OR not 'generated'.
            .or('origin.is.null,origin.neq.generated')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Failed to fetch documents:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // ✅ Use original_name from metadata (SICHERHEITSARCHITEKTUR.md Section 2)
        // Fallback to storage path basename for legacy documents
        const friendlyDocs = documents?.map(doc => {
            const originalName = (doc.metadata as Record<string, unknown>)?.original_name as string | undefined;
            const pathParts = doc.file_url_encrypted?.split('/') || [];
            const fallbackName = pathParts[pathParts.length - 1] || 'Unknown File';

            return {
                id: doc.id,
                type: doc.document_type,
                name: originalName || fallbackName,
                createdAt: doc.created_at
            };
        });

        return NextResponse.json({ success: true, documents: friendlyDocs || [] });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
}
