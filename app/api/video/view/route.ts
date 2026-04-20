import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const supabaseAdmin = getSupabaseAdmin();

/**
 * POST /api/video/view
 *
 * Atomically increments the anonymous view counter for a public video page.
 * No authentication required — called from the public recruiter page.
 *
 * Security:
 *   - Token (UUID) grants no write access beyond this counter.
 *   - No caller identity is recorded (no IP, no session, no recruiter PII).
 *
 * DSGVO:
 *   - view_count is metadata about the video, not about the recruiter.
 *   - Lawful basis: Art. 6(1)(f) legitimate interest of the applicant.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as { token?: string };
        const token = body?.token;

        if (!token || typeof token !== 'string') {
            return new NextResponse(null, { status: 204 });
        }

        // Atomic increment via Postgres RPC — no read-then-write race condition.
        // The function handles first_viewed_at (COALESCE preserves existing value).
        await supabaseAdmin.rpc('increment_video_view', { p_token: token });

        return new NextResponse(null, { status: 204 });

    } catch {
        // Silent failure — view tracking must never break the recruiter experience
        return new NextResponse(null, { status: 204 });
    }
}
