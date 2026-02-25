export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/complete
 * Marks onboarding as completed in user_settings.
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
            console.error('[onboarding/complete] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[onboarding/complete] Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
