import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * POST /api/profile/dismiss-cv-migration
 *
 * Sets user_profiles.cv_migration_seen_at = NOW() so the post-Single-CV
 * migration banner stops appearing for this user. Idempotent.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { error: updateErr } = await supabaseAdmin
            .from('user_profiles')
            .update({ cv_migration_seen_at: new Date().toISOString() })
            .eq('id', user.id);

        if (updateErr) {
            console.error('[dismiss-cv-migration] update failed', updateErr.message);
            return NextResponse.json({ error: 'Update failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[dismiss-cv-migration] server error', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
