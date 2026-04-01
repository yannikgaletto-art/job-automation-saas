/**
 * Credit Gate — API Route Wrapper
 * Feature-Silo: billing (NEW)
 *
 * Wraps AI operations with credit checks.
 * Used at the API route level — does NOT modify feature services.
 *
 * Usage in API routes:
 *   const result = await withCreditGate(userId, 0.5, 'cover_letter', () => generateCoverLetter(...), jobId);
 */

import { NextResponse } from 'next/server';
import { debitCredits, refundCredits, checkCoachingQuota, checkJobSearchQuota } from '@/lib/services/credit-service';
import {
    CreditExhaustedError,
    QuotaExhaustedError,
    type CreditEventType,
} from '@/lib/services/credit-types';

/**
 * Wrap an AI operation with credit gating.
 * 1. Atomically debits credits
 * 2. Executes the operation
 * 3. Refunds on failure
 */
export async function withCreditGate<T>(
    userId: string,
    creditCost: number,
    eventType: CreditEventType,
    operation: () => Promise<T>,
    jobId?: string
): Promise<T> {
    // 1. Atomic debit
    const { success, remaining } = await debitCredits(userId, creditCost, eventType, jobId);

    if (!success) {
        throw new CreditExhaustedError(remaining);
    }

    try {
        // 2. Execute the AI operation
        const result = await operation();
        return result;
    } catch (error) {
        // 3. Refund on failure (any error = user gets credits back)
        const reason = error instanceof Error ? error.message.slice(0, 100) : 'Unknown error';
        await refundCredits(userId, creditCost, eventType, reason, jobId);
        console.log(`↩️ [CreditGate] Auto-refunded ${creditCost} credits (${eventType}) due to error`);
        throw error;
    }
}

/**
 * Check coaching quota before a session.
 * Throws QuotaExhaustedError if limit reached.
 */
export async function requireCoachingQuota(userId: string): Promise<void> {
    const hasQuota = await checkCoachingQuota(userId);
    if (!hasQuota) {
        throw new QuotaExhaustedError('coaching');
    }
}

/**
 * Check job search quota before a search.
 * Throws QuotaExhaustedError if limit reached.
 */
export async function requireJobSearchQuota(userId: string): Promise<void> {
    const hasQuota = await checkJobSearchQuota(userId);
    if (!hasQuota) {
        throw new QuotaExhaustedError('job_search');
    }
}

/**
 * Helper: Convert credit/quota errors to proper HTTP responses.
 * Use in API route catch blocks.
 */
export function handleBillingError(error: unknown): NextResponse | null {
    if (error instanceof CreditExhaustedError) {
        return NextResponse.json(
            {
                error: 'CREDITS_EXHAUSTED',
                remaining: error.remaining,
                upgradeUrl: error.upgradeUrl,
            },
            { status: 402 }
        );
    }

    if (error instanceof QuotaExhaustedError) {
        return NextResponse.json(
            {
                error: `${error.quotaType.toUpperCase()}_QUOTA_EXHAUSTED`,
                quotaType: error.quotaType,
                upgradeUrl: error.upgradeUrl,
            },
            { status: 402 }
        );
    }

    return null; // Not a billing error
}
