import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/documents/list-cvs
 * Returns all CV documents for the authenticated user.
 * Used by CVSelectDialog to let the user pick which CV to use.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: docs, error } = await supabase
            .from('documents')
            .select('id, metadata, created_at')
            .eq('user_id', user.id)
            .eq('document_type', 'cv')
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const cvs = (docs || []).map((doc) => {
            const meta = doc.metadata as Record<string, unknown>;
            return {
                id: doc.id,
                name: (meta?.original_name as string) || 'Lebenslauf',
                createdAt: doc.created_at,
            };
        });

        return NextResponse.json({ success: true, cvs });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
