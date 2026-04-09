export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/cover-letter/drafts/[id]
 * Returns full draft content for a single draft.
 *
 * Auth: Required (401)
 * Security: User-scoped — .eq('user_id', userId) (403 for foreign IDs)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const { data: doc, error } = await supabase
            .from('documents')
            .select('id, created_at, metadata')
            .eq('id', id)
            .eq('user_id', user.id)
            .eq('document_type', 'cover_letter')
            .single();

        if (error || !doc) {
            return NextResponse.json(
                { success: false, error: 'Draft not found or access denied' },
                { status: 403 }
            );
        }

        const meta = doc.metadata as Record<string, unknown> | null;

        return NextResponse.json({
            success: true,
            draft: {
                id: doc.id,
                created_at: doc.created_at,
                job_id: meta?.job_id ?? null,
                generated_content: meta?.generated_content ?? null,
                quality_scores: meta?.quality_scores ?? null,
                fluff_warning: meta?.fluff_warning ?? false,
                pipeline_warnings: meta?.pipeline_warnings ?? [],
                pipeline_improved: meta?.pipeline_improved ?? false,
                setup_context: meta?.setup_context ?? null,
            },
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { success: false, error: errMsg },
            { status: 500 }
        );
    }
}
