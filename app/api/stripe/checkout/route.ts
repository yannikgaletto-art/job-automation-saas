/**
 * Stripe Checkout API Route
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for subscription or one-time topup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCheckoutSession, STRIPE_PRICES } from '@/lib/services/stripe-service';
import { getUserCredits } from '@/lib/services/credit-service';
import { MAX_TOPUPS_PER_MONTH } from '@/lib/services/credit-types';

export async function POST(request: NextRequest) {
    try {
        // 1. Auth check
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Parse body
        const body = await request.json();
        const { priceId } = body as { priceId: string };

        if (!priceId) {
            return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
        }

        // 3. Validate price ID
        const validPrices = Object.values(STRIPE_PRICES).filter(Boolean);
        if (!validPrices.includes(priceId)) {
            return NextResponse.json({ error: 'Invalid priceId' }, { status: 400 });
        }

        // 4. Check topup limit (max 2/month)
        if (priceId === STRIPE_PRICES.topup) {
            const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
            const admin = getSupabaseAdmin();

            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const { count } = await admin
                .from('credit_events')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('event_type', 'topup')
                .gte('created_at', monthStart.toISOString());

            if ((count ?? 0) >= MAX_TOPUPS_PER_MONTH) {
                return NextResponse.json(
                    { error: 'TOPUP_LIMIT_REACHED', maxPerMonth: MAX_TOPUPS_PER_MONTH },
                    { status: 429 }
                );
            }
        }

        // 5. Determine mode
        const isTopup = priceId === STRIPE_PRICES.topup;
        const mode = isTopup ? 'payment' : 'subscription';

        // 6. Get existing Stripe customer ID
        const credits = await getUserCredits(user.id);
        const stripeCustomerId = credits?.stripeCustomerId || undefined;

        // 7. Build URLs
        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const successUrl = `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}/dashboard/upgrade?checkout=cancelled`;

        // 8. Create checkout session
        const checkoutUrl = await createCheckoutSession({
            priceId,
            mode,
            userId: user.id,
            customerEmail: user.email!,
            stripeCustomerId,
            successUrl,
            cancelUrl,
        });

        console.log(`💳 [Stripe] Checkout session created for user ${user.id.slice(0, 8)}… (${mode})`);

        return NextResponse.json({ checkoutUrl });
    } catch (error) {
        console.error('❌ [Stripe] Checkout error:', error);
        return NextResponse.json(
            { error: 'Failed to create checkout session' },
            { status: 500 }
        );
    }
}
