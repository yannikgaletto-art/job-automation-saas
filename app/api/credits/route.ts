/**
 * Credits API Route
 * GET /api/credits
 *
 * Returns the current user's credit information.
 * Used by the frontend credit dashboard widget.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserCreditsForClient } from '@/lib/services/credit-service';
import { PLAN_CONFIG } from '@/lib/services/credit-types';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const credits = await getUserCreditsForClient(user.id);

        if (!credits) {
            // New user — no user_credits row yet (trigger may not have fired in beta)
            // Return full plan defaults so the UI shows correct quota bars
            return NextResponse.json({
                planType: 'free',
                creditsTotal: PLAN_CONFIG.free.credits,
                creditsUsed: 0,
                topupCredits: 0,
                creditsAvailable: PLAN_CONFIG.free.credits,
                coachingSessionsTotal: PLAN_CONFIG.free.coachingSessions,
                coachingSessionsUsed: 0,
                jobSearchesTotal: PLAN_CONFIG.free.jobSearches,
                jobSearchesUsed: 0,
                billingPeriodEnd: null,
                stripeCustomerId: null,
            });
        }

        return NextResponse.json(credits);
    } catch (error) {
        console.error('❌ [Credits] API error:', error);
        return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
    }
}
