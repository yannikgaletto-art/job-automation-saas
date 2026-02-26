export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/cover-letter/drafts
 * Returns all cover letter drafts for the authenticated user.
 * Sorted by created_at DESC, grouped by job_id in metadata.
 *
 * Auth: Required (401 without valid session)
 * Reference: B1.4 (Auto-Save) + SICHERHEITSARCHITEKTUR Contract 3 (user-scoped queries)
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const { data: drafts, error } = await supabase
            .from('documents')
            .select('id, created_at, metadata')
            .eq('user_id', user.id)
            .eq('document_type', 'cover_letter')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Failed to fetch cover letter drafts:', error);
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        // Filter to only drafts (status='draft' in metadata) and format response
        const draftList = (drafts || [])
            .filter(doc => {
                const meta = doc.metadata as Record<string, unknown> | null;
                return meta?.status === 'draft';
            })
            .map(doc => {
                const meta = doc.metadata as Record<string, unknown>;
                return {
                    id: doc.id,
                    job_id: meta?.job_id ?? null,
                    created_at: doc.created_at,
                    quality_scores: meta?.quality_scores ?? null,
                    fluff_warning: meta?.fluff_warning ?? false,
                    preview: typeof meta?.generated_content === 'string'
                        ? (meta.generated_content as string).slice(0, 150) + '...'
                        : null,
                    xray_annotations: meta?.xray_annotations ?? null,    // B4.1
                    pipeline_warnings: meta?.pipeline_warnings ?? [],    // B4.1
                    pipeline_improved: meta?.pipeline_improved ?? false, // B4.1
                };
            });

        return NextResponse.json({
            success: true,
            drafts: draftList,
            total: draftList.length,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { success: false, error: errMsg },
            { status: 500 }
        );
    }
}
