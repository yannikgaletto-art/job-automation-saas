import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSSRClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

/**
 * Admin API: List all users, delete users, reset onboarding.
 * 
 * Security: Double-check — session auth + admin email whitelist.
 * Uses SUPABASE_SERVICE_ROLE_KEY to access auth.admin API.
 */

// GET /api/admin/users — list all registered users
export async function GET() {
    // Auth check
    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Use admin client to list users
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await adminClient.auth.admin.listUsers();

    if (error) {
        console.error('[admin/users] listUsers error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch onboarding status for all users
    const userIds = data.users.map(u => u.id);
    const { data: settings } = await adminClient
        .from('user_settings')
        .select('user_id, onboarding_completed')
        .in('user_id', userIds);

    const settingsMap = new Map(
        (settings || []).map(s => [s.user_id, s.onboarding_completed])
    );

    // Fetch active job counts per user (DSGVO-compliant: only counts, no job data)
    const { data: jobCounts } = await adminClient
        .from('job_queue')
        .select('user_id');

    const jobCountMap = new Map<string, number>();
    for (const row of jobCounts || []) {
        jobCountMap.set(row.user_id, (jobCountMap.get(row.user_id) || 0) + 1);
    }

    // Fetch application history counts per user (DSGVO-compliant: only counts)
    const { data: appCounts } = await adminClient
        .from('application_history')
        .select('user_id');

    const appCountMap = new Map<string, number>();
    for (const row of appCounts || []) {
        appCountMap.set(row.user_id, (appCountMap.get(row.user_id) || 0) + 1);
    }

    const users = data.users.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || null,
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at,
        last_sign_in_at: u.last_sign_in_at,
        onboarding_completed: settingsMap.get(u.id) ?? false,
        active_jobs: jobCountMap.get(u.id) || 0,
        applications: appCountMap.get(u.id) || 0,
    }));

    // Sort by created_at descending (newest first)
    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ success: true, users, total: users.length });
}

// DELETE /api/admin/users — delete a user by ID
export async function DELETE(request: Request) {
    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await request.json() as { userId: string };

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === user.id) {
        return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // --- CASCADE DELETE: all user-scoped tables (ordered: leaf tables first) ---
    // These must all be cleaned before deleting the auth user to avoid FK constraint errors.
    const tables = [
        'credit_events',
        'processed_stripe_events',
        'generation_logs',
        'coaching_sessions',
        'job_certificates',
        'validation_logs',
        'video_scripts',
        'video_approaches',
        'script_block_templates',
        'mood_checkins',
        'daily_energy',
        'daily_briefings',
        'pomodoro_sessions',
        'tasks',
        'community_upvotes',
        'community_comments',
        'community_posts',
        'volunteering_bookmarks',
        'volunteering_votes',
        'application_history',
        'company_research',
        'saved_job_searches',
        'job_queue',
        'documents',
        'user_credits',
        'user_profiles',
        'user_values',
        'user_settings',
    ] as const;

    for (const table of tables) {
        const { error: delErr } = await adminClient.from(table).delete().eq('user_id', userId);
        if (delErr) {
            // Log but continue — table may not exist yet or may have no rows
            console.warn(`[admin/users] cascade delete warn (${table}):`, delErr.message);
        }
    }

    // Delete the auth user (only after all FK refs are gone)
    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
        console.error('[admin/users] deleteUser error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[admin] User ${userId} deleted by ${user.email}`);
    return NextResponse.json({ success: true });
}

// PATCH /api/admin/users — reset onboarding for a user
export async function PATCH(request: Request) {
    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, action } = await request.json() as { userId: string; action: string };

    if (!userId || action !== 'reset_onboarding') {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminClient
        .from('user_settings')
        .update({ onboarding_completed: false })
        .eq('user_id', userId);

    if (error) {
        console.error('[admin/users] resetOnboarding error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[admin] Onboarding reset for ${userId} by ${user.email}`);
    return NextResponse.json({ success: true });
}
