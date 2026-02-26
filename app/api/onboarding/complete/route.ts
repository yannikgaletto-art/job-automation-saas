export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/complete
 * Marks onboarding as completed in user_settings.
 * Implements Write→Read-Back→Validate pattern (SICHERHEITSARCHITEKTUR.md Section 1).
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
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { step } = await request.json();

        const { error } = await supabaseAdmin
            .from('user_settings')
            .upsert(
                {
                    user_id: user.id,
                    onboarding_completed: true,
                    onboarding_step: step || 5,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
            );

        if (error) {
            console.error('[onboarding/complete] Upsert error:', error);
            return NextResponse.json({ error: error.message, success: false }, { status: 500 });
        }

        // ✅ READ-BACK: Verify flag was actually written (SICHERHEITSARCHITEKTUR.md Section 1)
        const { data: verify, error: verifyError } = await supabaseAdmin
            .from('user_settings')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .single();

        if (verifyError || !verify?.onboarding_completed) {
            console.error('[onboarding/complete] Read-back failed:', verifyError);
            return NextResponse.json({ error: 'Verification failed', success: false }, { status: 500 });
        }

        return NextResponse.json({ success: true }); // NUR hier — nach verifiziertem Read-Back
    } catch (error: unknown) {
        console.error('[onboarding/complete] Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
