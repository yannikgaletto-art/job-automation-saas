/**
 * Referral Service — Shared Business Logic (V3, RPC-Free)
 * Feature-Silo: §11 Referral
 *
 * CTO Decision: No database RPC. All logic in application code.
 * Reason: Supabase SQL Editor cannot deploy PL/pgSQL functions ($$-parser bug).
 * The UNIQUE(referred_user_id) constraint prevents double-claims at DB level.
 * Referral claims happen exactly once per user (during onboarding) — no race condition risk.
 *
 * Design:
 *   - referral_code lives in user_profiles (stable, 1:1 with user)
 *   - referrals table = claim log (1 row per successful invite)
 *   - Credit grants via direct admin client (same pattern as credit-service.ts)
 *
 * Uses: getSupabaseAdmin() singleton (§9.3 pattern)
 * Credits: +5 topup for referrer, +3 topup for referred
 * Lifetime cap: 10 credited referrals per user
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';

// ── Constants ─────────────────────────────────────────────────────

const MAX_REFERRALS = 10;
const REFERRER_BONUS = 5.0;
const REFERRED_BONUS = 3.0;

// ── Types ─────────────────────────────────────────────────────────

export interface ReferralInfo {
    code: string;
    link: string;
    stats: {
        credited: number;   // Successfully credited referrals
        remaining: number;  // MAX_REFERRALS - credited
    };
}

export interface ClaimResult {
    success: boolean;
    bonusCredits?: number;
    error?: string;
}

// ── Code Generation ───────────────────────────────────────────────

function generateReferralCode(userId: string): string {
    const prefix = userId.replace(/-/g, '').slice(0, 6);
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${prefix}-${suffix}`;
}

// ── Helper: Grant topup credits to a user ─────────────────────────

async function grantTopupCredits(
    userId: string,
    amount: number,
    eventType: string = 'referral_bonus',
): Promise<boolean> {
    const admin = getSupabaseAdmin();

    // Read current balance
    const { data: credits, error: readErr } = await admin
        .from('user_credits')
        .select('credits_used, credits_total, topup_credits')
        .eq('user_id', userId)
        .single();

    if (readErr || !credits) {
        console.error(`[referral-service] Credits read failed for ${userId}:`, readErr?.message);
        return false;
    }

    const available = (credits.credits_total - credits.credits_used) + credits.topup_credits;

    // Update topup credits
    const { error: updateErr } = await admin
        .from('user_credits')
        .update({
            topup_credits: credits.topup_credits + amount,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    if (updateErr) {
        console.error(`[referral-service] Credits update failed for ${userId}:`, updateErr.message);
        return false;
    }

    // Audit trail
    const { error: auditErr } = await admin
        .from('credit_events')
        .insert({
            user_id: userId,
            event_type: eventType,
            credits_amount: amount,
            credits_before: available,
            credits_after: available + amount,
        });

    if (auditErr) {
        // Non-blocking: credits were granted, audit is secondary
        console.warn(`[referral-service] Audit insert failed for ${userId}:`, auditErr.message);
    }

    return true;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Get or create the user's unique referral code + stats.
 * Code is stored in user_profiles.referral_code (stable, never changes).
 * Lazy-creates on first call.
 */
export async function getOrCreateReferralCode(
    userId: string,
    baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://app.path-ly.eu',
): Promise<ReferralInfo> {
    const admin = getSupabaseAdmin();

    // 1. Read existing code from user_profiles
    const { data: profile, error: profileError } = await admin
        .from('user_profiles')
        .select('referral_code')
        .eq('id', userId)
        .single();

    if (profileError) {
        console.error('[referral-service] Profile fetch error:', profileError.message);
        throw new Error('Failed to load referral data');
    }

    let code = profile?.referral_code;

    // 2. Lazy-create code if not set
    if (!code) {
        code = generateReferralCode(userId);
        const { error: updateError } = await admin
            .from('user_profiles')
            .update({ referral_code: code })
            .eq('id', userId);

        if (updateError) {
            if (updateError.code === '23505') {
                // UNIQUE violation → race condition, retry read
                const { data: retry } = await admin
                    .from('user_profiles')
                    .select('referral_code')
                    .eq('id', userId)
                    .single();
                code = retry?.referral_code || code;
            } else {
                console.error('[referral-service] Update error:', updateError.message);
                throw new Error('Failed to create referral code');
            }
        }
    }

    // 3. Count successful referrals from claim log
    const { count: credited, error: countError } = await admin
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', userId);

    if (countError) {
        console.error('[referral-service] Count error:', countError.message);
    }

    const creditedCount = credited ?? 0;

    return {
        code,
        link: `${baseUrl}/signup?ref=${code}`,
        stats: {
            credited: creditedCount,
            remaining: Math.max(MAX_REFERRALS - creditedCount, 0),
        },
    };
}


/**
 * Claim a referral bonus.
 * Called ONCE from api/onboarding/complete (non-blocking).
 *
 * Guards (all in application code):
 *   1. Self-invite → rejected
 *   2. Already claimed → idempotent success (UNIQUE constraint)
 *   3. Lifetime cap → 10 max
 *   4. Invalid code → rejected
 *
 * Atomicity: The UNIQUE(referred_user_id) constraint on 'referrals' prevents
 * double-claims at DB level. Since claims happen exactly once per user during
 * onboarding, race conditions are practically impossible.
 */
export async function claimReferral(
    referredUserId: string,
    referralCode: string,
): Promise<ClaimResult> {
    const admin = getSupabaseAdmin();

    // 1. Find referrer by code
    const { data: referrer, error: lookupError } = await admin
        .from('user_profiles')
        .select('id')
        .eq('referral_code', referralCode)
        .maybeSingle();

    if (lookupError || !referrer) {
        return { success: false, error: 'invalid_code' };
    }

    // 2. Self-invite guard
    if (referrer.id === referredUserId) {
        return { success: false, error: 'self_invite' };
    }

    // 3. Already-claimed guard (check BEFORE insert to avoid unnecessary work)
    const { count: existingClaims } = await admin
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referred_user_id', referredUserId);

    if (existingClaims && existingClaims > 0) {
        return { success: true, bonusCredits: 0 }; // Idempotent
    }

    // 4. Lifetime cap check
    const { count: referrerCount } = await admin
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', referrer.id);

    if (referrerCount && referrerCount >= MAX_REFERRALS) {
        return { success: false, error: 'cap_reached' };
    }

    // 5. Insert claim record (UNIQUE constraint = final guard against double-claim)
    const { error: insertError } = await admin
        .from('referrals')
        .insert({
            referrer_id: referrer.id,
            referred_user_id: referredUserId,
        });

    if (insertError) {
        if (insertError.code === '23505') {
            // UNIQUE violation → already claimed
            return { success: true, bonusCredits: 0 };
        }
        console.error('[referral-service] Insert error:', insertError.message);
        return { success: false, error: 'insert_failed' };
    }

    // 6. Grant credits (non-atomic but safe: worst case = free credits, not security issue)
    const referrerGranted = await grantTopupCredits(referrer.id, REFERRER_BONUS);
    const referredGranted = await grantTopupCredits(referredUserId, REFERRED_BONUS);

    if (!referrerGranted || !referredGranted) {
        console.warn('[referral-service] Partial credit grant — claim recorded but credits may be incomplete');
    }

    return { success: true, bonusCredits: REFERRED_BONUS };
}
