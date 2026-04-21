export const dynamic = 'force-dynamic';

/**
 * POST /api/referral/notifications/dismiss
 * Marks a referral notification as read.
 * 
 * Body: { id: string, type: 'referrer_bonus' | 'referred_welcome' }
 * Feature-Silo: §11 Referral
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, type } = await request.json();

        if (!id || !type) {
            return NextResponse.json({ error: 'Missing id or type' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        if (type === 'referrer_bonus') {
            // Mark referrer notification as read (only if the user owns it)
            await admin
                .from('referrals')
                .update({ referrer_notified: true })
                .eq('id', id)
                .eq('referrer_id', user.id);
        } else if (type === 'referred_welcome') {
            // Mark referred notification as read (only if the user owns it)
            await admin
                .from('referrals')
                .update({ referred_notified: true })
                .eq('id', id)
                .eq('referred_user_id', user.id);
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[api/referral/notifications/dismiss] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
