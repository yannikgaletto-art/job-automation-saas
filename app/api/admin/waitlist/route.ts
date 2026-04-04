import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSSRClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

/**
 * Admin API: Waitlist Leads Management
 *
 * GET  /api/admin/waitlist — list all waitlist leads
 * DELETE /api/admin/waitlist — delete a lead by ID (DSGVO Art. 17)
 *
 * Security: Session auth + admin email whitelist (same as admin/users)
 */

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── GET: List all leads ─────────────────────────────────────────────
export async function GET() {
    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: leads, error } = await supabaseAdmin
        .from('waitlist_leads')
        .select('id, email, source, locale, confirmed_at, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[admin/waitlist] List error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = leads?.length || 0;
    const confirmed = leads?.filter(l => l.confirmed_at).length || 0;

    return NextResponse.json({
        success: true,
        leads: leads || [],
        total,
        confirmed,
    });
}

// ─── DELETE: Remove a lead ──────────────────────────────────────────
export async function DELETE(request: Request) {
    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { leadId } = await request.json() as { leadId: string };

    if (!leadId) {
        return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('waitlist_leads')
        .delete()
        .eq('id', leadId);

    if (error) {
        console.error('[admin/waitlist] Delete error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[admin] Waitlist lead ${leadId} deleted by ${user.email}`);
    return NextResponse.json({ success: true });
}
