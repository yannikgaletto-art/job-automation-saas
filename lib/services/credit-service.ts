/**
 * Credit Service — Core Operations
 * Feature-Silo: billing (NEW)
 *
 * All credit mutations go through Supabase SECURITY DEFINER RPCs.
 * This service is the ONLY TypeScript entry point for credit operations.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { CreditInfo, DebitResult, CreditEventType } from './credit-types';

// Lazy-initialized admin client
function getAdmin() { return getSupabaseAdmin(); }

/**
 * Get credit info for frontend (strips internal fields).
 */
export async function getUserCreditsForClient(userId: string): Promise<Omit<CreditInfo, 'stripeCustomerId'> | null> {
    const credits = await getUserCredits(userId);
    if (!credits) return null;
    const { stripeCustomerId: _, ...clientSafe } = credits;
    return clientSafe;
}

/**
 * Atomically debit credits from a user's account.
 * Uses FOR UPDATE row lock to prevent race conditions.
 */
export async function debitCredits(
    userId: string,
    amount: number,
    eventType: CreditEventType,
    jobId?: string
): Promise<DebitResult> {
    const { data, error } = await getAdmin().rpc('debit_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_event_type: eventType,
        p_job_id: jobId || null,
    });

    if (error) {
        console.error('❌ [Credits] Debit failed:', error.message);
        return { success: false, remaining: 0 };
    }

    const result = data?.[0] ?? { success: false, remaining: 0 };
    if (result.success) {
        console.log(`💳 [Credits] Debited ${amount} (${eventType}) for user ${userId.slice(0, 8)}… | Remaining: ${result.remaining}`);
    }

    return result;
}

/**
 * Refund credits after a failed AI operation.
 */
export async function refundCredits(
    userId: string,
    amount: number,
    eventType: CreditEventType,
    reason?: string,
    jobId?: string
): Promise<void> {
    const { error } = await getAdmin().rpc('refund_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_event_type: eventType,
        p_reason: reason || 'API failure',
        p_job_id: jobId || null,
    });

    if (error) {
        console.error('❌ [Credits] Refund failed:', error.message);
    } else {
        console.log(`↩️ [Credits] Refunded ${amount} (${eventType}) for user ${userId.slice(0, 8)}…`);
    }
}

/**
 * Get full credit info for a user.
 */
export async function getUserCredits(userId: string): Promise<CreditInfo | null> {
    const { data, error } = await getAdmin()
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) {
        console.error('❌ [Credits] Fetch failed:', error?.message);
        return null;
    }

    return {
        planType: data.plan_type,
        creditsTotal: Number(data.credits_total),
        creditsUsed: Number(data.credits_used),
        topupCredits: Number(data.topup_credits),
        creditsAvailable: Number(data.credits_total) - Number(data.credits_used) + Number(data.topup_credits),
        coachingSessionsTotal: data.coaching_sessions_total,
        coachingSessionsUsed: data.coaching_sessions_used,
        jobSearchesTotal: data.job_searches_total,
        jobSearchesUsed: data.job_searches_used,
        billingPeriodEnd: data.billing_period_end,
        stripeCustomerId: data.stripe_customer_id,
        // NOTE: stripeCustomerId only used server-side (portal/checkout), filtered before client response
    };
}

/**
 * Check if user has enough coaching sessions remaining.
 * Generic: works for all plans — if total is 0, returns false automatically.
 */
export async function checkCoachingQuota(userId: string): Promise<boolean> {
    const credits = await getUserCredits(userId);
    if (!credits) return false;

    return credits.coachingSessionsUsed < credits.coachingSessionsTotal;
}

/**
 * Check if user has enough job search quota remaining.
 * Generic: works for all plans — if total is 0, returns false automatically.
 */
export async function checkJobSearchQuota(userId: string): Promise<boolean> {
    const credits = await getUserCredits(userId);
    if (!credits) return false;

    return credits.jobSearchesUsed < credits.jobSearchesTotal;
}

/**
 * Increment coaching session counter.
 * Calls an atomic SQL function to prevent race conditions.
 */
export async function incrementCoachingUsage(userId: string): Promise<void> {
    const { error } = await getAdmin().rpc('increment_coaching_usage', { p_user_id: userId });
    if (error) {
        console.error('❌ [Credits] Coaching increment failed:', error.message);
    }
}

/**
 * Increment job search counter.
 * Calls an atomic SQL function to prevent race conditions.
 */
export async function incrementJobSearchUsage(userId: string): Promise<void> {
    const { error } = await getAdmin().rpc('increment_job_search_usage', { p_user_id: userId });
    if (error) {
        console.error('❌ [Credits] Search increment failed:', error.message);
    }
}
