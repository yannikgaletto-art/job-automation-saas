export const dynamic = 'force-dynamic';

/**
 * POST /api/user/energy
 * Stores daily energy level from Morning Briefing check-in.
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

        const { energy } = await request.json();
        if (!energy || energy < 1 || energy > 5) {
            return NextResponse.json({ error: 'Invalid energy level' }, { status: 400 });
        }

        const today = new Date().toISOString().split('T')[0];

        const { error } = await supabaseAdmin
            .from('daily_energy')
            .upsert({
                user_id: user.id,
                date: today,
                energy,
            }, { onConflict: 'user_id,date' });

        if (error) {
            console.error('[user/energy] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[user/energy] Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
