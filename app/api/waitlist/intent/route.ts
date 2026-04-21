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

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plan, locale } = await request.json();

        if (!plan || !['starter', 'durchstarter', 'quarterly'].includes(plan)) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        // Upsert — if user already registered interest, just update the plan
        const { error: upsertError } = await supabaseAdmin
            .from('waitlist_leads')
            .upsert(
                {
                    email: user.email,
                    plan_preference: plan,
                    locale: locale || 'de',
                    source: 'settings',
                    confirmed_at: new Date().toISOString(), // Auto-confirmed (user is already authenticated)
                },
                { onConflict: 'email' }
            );

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
