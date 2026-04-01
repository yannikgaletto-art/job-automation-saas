/**
 * Stripe Customer Portal API Route
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session for self-service plan management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserCredits } from '@/lib/services/credit-service';
import { createPortalSession } from '@/lib/services/stripe-service';

export async function POST(request: NextRequest) {
    try {
        // 1. Auth check
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Get Stripe customer ID
        const credits = await getUserCredits(user.id);

        if (!credits?.stripeCustomerId) {
            return NextResponse.json(
                { error: 'No billing account found. Please subscribe first.' },
                { status: 404 }
            );
        }

        // 3. Build return URL
        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const returnUrl = `${origin}/dashboard/settings`;

        // 4. Create portal session
        const portalUrl = await createPortalSession(credits.stripeCustomerId, returnUrl);

        console.log(`🔗 [Stripe] Portal session created for user ${user.id.slice(0, 8)}…`);

        return NextResponse.json({ portalUrl });
    } catch (error) {
        console.error('❌ [Stripe] Portal error:', error);
        return NextResponse.json(
            { error: 'Failed to create portal session' },
            { status: 500 }
        );
    }
}
