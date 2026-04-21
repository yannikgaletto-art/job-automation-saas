export const dynamic = 'force-dynamic';

/**
 * GET /api/referral/notifications
 * Returns pending referral notifications for the current user.
 * 
 * Checks both roles:
 *   - As REFERRER: "Someone you invited just joined" (referrer_notified = false)
 *   - As REFERRED: "Welcome! You were invited by X" (referred_notified = false)
 * 
 * Feature-Silo: §11 Referral
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ReferralNotification {
    id: string;
    type: 'referrer_bonus' | 'referred_welcome';
    referrerName: string | null;
    credits: number;
}

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = getSupabaseAdmin();
        const notifications: ReferralNotification[] = [];

        // 1. Check if user is a REFERRER with unnotified claims
        const { data: asReferrer } = await admin
            .from('referrals')
            .select('id')
            .eq('referrer_id', user.id)
            .eq('referrer_notified', false)
            .limit(1);

        if (asReferrer && asReferrer.length > 0) {
            notifications.push({
                id: asReferrer[0].id,
                type: 'referrer_bonus',
                referrerName: null, // Not needed for referrer notification
                credits: 5,
            });
        }

        // 2. Check if user was REFERRED with unnotified welcome
        const { data: asReferred } = await admin
            .from('referrals')
            .select('id, referrer_id')
            .eq('referred_user_id', user.id)
            .eq('referred_notified', false)
            .limit(1);

        if (asReferred && asReferred.length > 0) {
            // Fetch referrer's name for the welcome message
            const { data: referrerProfile } = await admin
                .from('user_profiles')
                .select('full_name')
                .eq('id', asReferred[0].referrer_id)
                .single();

            notifications.push({
                id: asReferred[0].id,
                type: 'referred_welcome',
                referrerName: referrerProfile?.full_name || null,
                credits: 3,
            });
        }

        return NextResponse.json({ notifications });
    } catch (error: unknown) {
        console.error('[api/referral/notifications] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
