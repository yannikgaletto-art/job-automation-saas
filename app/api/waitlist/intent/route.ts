export const dynamic = 'force-dynamic';

/**
 * POST /api/waitlist/intent
 *
 * Records a user's plan interest from the Settings launch waitlist.
 * Uses the authenticated user's email — no extra input needed.
 * Stores in waitlist_leads with source='settings'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const VALID_PLANS = ['free', 'starter', 'durchstarter', 'quarterly', 'custom'] as const;
type PlanOption = typeof VALID_PLANS[number];

const CUSTOM_MIN_EUR = 5;
const CUSTOM_MAX_EUR = 100;
const CUSTOM_CREDITS_PER_EUR = 2.25;

type PlanBenefits = { amountEur?: number; credits: number; coachingSessions: number; jobSearches: number };

const PLAN_BENEFITS: Record<Exclude<PlanOption, 'custom'>, PlanBenefits> = {
    free: { credits: 3, coachingSessions: 1, jobSearches: 2 },
    starter: { credits: 20, coachingSessions: 8, jobSearches: 20 },
    durchstarter: { credits: 45, coachingSessions: 15, jobSearches: 35 },
    quarterly: { credits: 60, coachingSessions: 18, jobSearches: 45 },
};

function calculateCustomBenefits(amountEur: number) {
    const boundedAmount = Math.min(CUSTOM_MAX_EUR, Math.max(CUSTOM_MIN_EUR, amountEur));
    const credits = Math.max(5, Math.floor((boundedAmount * CUSTOM_CREDITS_PER_EUR) / 5) * 5);

    return {
        amountEur: boundedAmount,
        credits,
        coachingSessions: Math.max(1, Math.floor(credits / 3)),
        jobSearches: credits,
    };
}

function buildPlanMetadata(plan: PlanOption, customAmountEur?: unknown) {
    const benefits = plan === 'custom'
        ? calculateCustomBenefits(Number(customAmountEur))
        : PLAN_BENEFITS[plan];

    return {
        benefits,
        utmSource: [
            `waitlist_plan:${plan}`,
            plan === 'custom' ? `amount_eur:${benefits.amountEur}` : null,
            `credits:${benefits.credits}`,
            `coaching:${benefits.coachingSessions}`,
            `searches:${benefits.jobSearches}`,
        ].filter(Boolean).join(';'),
    };
}

function fallbackPlanPreference(plan: PlanOption) {
    // Older production DB constraints only allow free/starter/durchstarter.
    // Keep true intent in utm_source so the admin waitlist still shows it.
    return plan === 'quarterly' || plan === 'custom' ? 'starter' : plan;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plan, locale, customAmountEur } = await request.json();

        if (!plan || !VALID_PLANS.includes(plan)) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        if (plan === 'custom' && !Number.isFinite(Number(customAmountEur))) {
            return NextResponse.json({ error: 'Invalid custom amount' }, { status: 400 });
        }

        const { benefits, utmSource } = buildPlanMetadata(plan, customAmountEur);

        // Upsert — if user already registered interest, just update the plan
        const waitlistPayload = {
            email: user.email,
            plan_preference: plan,
            utm_source: utmSource,
            locale: locale || 'de',
            source: 'settings',
            confirmed_at: new Date().toISOString(), // Auto-confirmed (user is already authenticated)
        };

        let { error: upsertError } = await supabaseAdmin
            .from('waitlist_leads')
            .upsert(waitlistPayload, { onConflict: 'email' });

        if (upsertError?.code === '23514') {
            const retryPayload = {
                ...waitlistPayload,
                plan_preference: fallbackPlanPreference(plan),
            };
            const retry = await supabaseAdmin
                .from('waitlist_leads')
                .upsert(retryPayload, { onConflict: 'email' });
            upsertError = retry.error;
        }

        if (upsertError) {
            // Duplicate email with different conflict handling
            if (upsertError.code === '23505') {
                return NextResponse.json({ error: 'Already registered' }, { status: 409 });
            }
            console.error('[waitlist/intent] Upsert error:', upsertError.message);
            return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
        }

        // PostHog — track plan intent
        try {
            const { captureServerEvent } = await import('@/lib/posthog/server');
            captureServerEvent(user.id, 'launch_plan_intent', {
                plan,
                credits: benefits.credits,
                coaching_sessions: benefits.coachingSessions,
                job_searches: benefits.jobSearches,
                custom_amount_eur: plan === 'custom' ? benefits.amountEur : undefined,
                source: 'settings',
            });
        } catch {
            // Analytics are non-blocking
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[waitlist/intent] Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
