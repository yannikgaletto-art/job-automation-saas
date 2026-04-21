export const dynamic = 'force-dynamic';

/**
 * GET /api/referral/code
 * Returns the user's referral code, share link, and stats.
 * Feature-Silo: §11 Referral
 *
 * Lazy-creates the referral code on first access.
 * Auth: Cookie-based (Dashboard session required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateReferralCode } from '@/lib/services/referral-service';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Derive the base URL from the actual HTTP request origin.
        // This is always correct regardless of ENV variable state —
        // no stale build-time values can cause a wrong referral link.
        const requestUrl = new URL(request.url);
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

        const referralInfo = await getOrCreateReferralCode(user.id, baseUrl);

        return NextResponse.json(referralInfo);
    } catch (error: unknown) {
        console.error('[api/referral/code] Error:', error);
        return NextResponse.json(
            { error: 'Internal error' },
            { status: 500 },
        );
    }
}
