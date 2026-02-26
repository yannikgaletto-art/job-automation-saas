export const dynamic = 'force-dynamic';

/**
 * GET /api/onboarding/status
 * Returns whether onboarding is completed for the current user.
 * Used by onboarding/page.tsx mount-guard to prevent re-entry loop.
 * (SICHERHEITSARCHITEKTUR.md Section 1)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ completed: false }, { status: 401 });
        }

        const { data } = await supabase
            .from('user_settings')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle();

        return NextResponse.json({ completed: data?.onboarding_completed === true });
    } catch {
        return NextResponse.json({ completed: false }, { status: 500 });
    }
}
