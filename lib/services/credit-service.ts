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
        // BETA FALLBACK: If billing tables/RPCs don't exist yet on this DB,
        // don't block the user. Log and allow through.
        const isMissingTable =
            error.code === 'PGRST202' ||     // RPC not found
            error.code === '42883' ||          // function does not exist
            error.code === 'PGRST205' ||      // table not found
            error.message?.includes('debit_credits') ||
            error.message?.includes('user_credits');

        if (isMissingTable) {
            console.warn(`⚠️ [Credits] Billing not provisioned on this DB — allowing ${eventType} (BETA fallback)`);
            return { success: true, remaining: 999 };
        }

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

    if (error) {
        // BETA FALLBACK: Table not provisioned yet → return synthetic free-plan data
        const isMissingTable =
            error.code === 'PGRST205' ||
            error.message?.includes('user_credits');

        if (isMissingTable) {
            console.warn('⚠️ [Credits] user_credits table missing — returning synthetic beta credit info');
            return {
                planType: 'free',
                creditsTotal: 10,
                creditsUsed: 0,
                topupCredits: 0,
                creditsAvailable: 10,
                coachingSessionsTotal: 5,
                coachingSessionsUsed: 0,
                jobSearchesTotal: 10,
                jobSearchesUsed: 0,
                billingPeriodEnd: null,
                stripeCustomerId: null,
            };
        }

        console.error('❌ [Credits] Fetch failed:', error.message);
        return null;
    }

    if (!data) {
        // ── Lazy Row Creation (ensure-on-read) ──────────────────────
        // Pre-migration users have no user_credits row. Instead of returning null
        // (which causes synthetic fallback data), create the row now.
        console.log(`💳 [Credits] No row for user ${userId.slice(0, 8)}… — creating free-plan row`);
        const { data: newRow, error: insertError } = await getAdmin()
            .from('user_credits')
            .upsert({
                user_id: userId,
                plan_type: 'free',
                credits_total: 10.0,
                credits_used: 0,
                topup_credits: 0,
                coaching_sessions_total: 5,
                coaching_sessions_used: 0,
                job_searches_total: 10,
                job_searches_used: 0,
            }, { onConflict: 'user_id' })
            .select('*')
            .single();

        if (insertError || !newRow) {
            console.error('❌ [Credits] Lazy row creation failed:', insertError?.message);
            return null;
        }

        return {
            planType: newRow.plan_type,
            creditsTotal: Number(newRow.credits_total),
            creditsUsed: Number(newRow.credits_used),
            topupCredits: Number(newRow.topup_credits),
            creditsAvailable: Number(newRow.credits_total) - Number(newRow.credits_used) + Number(newRow.topup_credits),
            coachingSessionsTotal: newRow.coaching_sessions_total,
            coachingSessionsUsed: newRow.coaching_sessions_used,
            jobSearchesTotal: newRow.job_searches_total,
            jobSearchesUsed: newRow.job_searches_used,
            billingPeriodEnd: newRow.billing_period_end,
            stripeCustomerId: newRow.stripe_customer_id,
        };
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
 * BETA: returns true if billing table not provisioned yet.
 */
export async function checkCoachingQuota(userId: string): Promise<boolean> {
    const credits = await getUserCredits(userId);
    if (!credits) return true; // BETA: fail-open if no credit info

    return credits.coachingSessionsUsed < credits.coachingSessionsTotal;
}

/**
 * Check if user has enough job search quota remaining.
 * BETA: returns true if billing table not provisioned yet.
 */
export async function checkJobSearchQuota(userId: string): Promise<boolean> {
    const credits = await getUserCredits(userId);
    if (!credits) return true; // BETA: fail-open if no credit info

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
