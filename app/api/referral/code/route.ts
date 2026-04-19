export const dynamic = 'force-dynamic';

/**
 * GET /api/referral/code
 * Returns the user's referral code, share link, and stats.
 * Feature-Silo: §11 Referral
 *
 * Lazy-creates the referral code on first access.
 * Auth: Cookie-based (Dashboard session required).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateReferralCode } from '@/lib/services/referral-service';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const referralInfo = await getOrCreateReferralCode(user.id);

        return NextResponse.json(referralInfo);
    } catch (error: unknown) {
        console.error('[api/referral/code] Error:', error);
        return NextResponse.json(
            { error: 'Internal error' },
            { status: 500 },
        );
    }
}
