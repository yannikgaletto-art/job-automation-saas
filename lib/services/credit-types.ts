/**
 * Credit System — Type Definitions
 * Feature-Silo: billing (NEW)
 *
 * Shared types for credit service, credit gate, and Stripe webhooks.
 */

// ============================================================================
// PLAN DEFINITIONS
// ============================================================================

export const PLAN_CONFIG = {
    free: {
        credits: 6.0,
        coachingSessions: 0,
        jobSearches: 0,
        label: 'Free',
    },
    starter: {
        credits: 20.0,
        coachingSessions: 3,
        jobSearches: 20,
        label: 'Starter',
    },
    durchstarter: {
        credits: 50.0,
        coachingSessions: 10,
        jobSearches: 50,
        label: 'Durchstarter',
    },
} as const;

export type PlanType = keyof typeof PLAN_CONFIG;

// ============================================================================
// CREDIT COSTS PER ACTION
// ============================================================================

export const CREDIT_COSTS = {
    cv_match: 0.5,
    cover_letter: 0.5,
    cv_optimize: 0.5,
    video_script: 0.5,
} as const;

export type CreditActionType = keyof typeof CREDIT_COSTS;

// ============================================================================
// EVENT TYPES (matches DB CHECK constraint)
// ============================================================================

export type CreditEventType =
    | 'cv_match'
    | 'cover_letter'
    | 'cv_optimize'
    | 'video_script'
    | 'coaching_session'
    | 'job_search'
    | 'topup'
    | 'plan_upgrade'
    | 'plan_downgrade'
    | 'monthly_reset'
    | 'refund'
    | 'admin_adjustment';

// ============================================================================
// CREDIT INFO (returned to frontend)
// ============================================================================

export interface CreditInfo {
    planType: PlanType;
    creditsTotal: number;
    creditsUsed: number;
    topupCredits: number;
    creditsAvailable: number;
    coachingSessionsTotal: number;
    coachingSessionsUsed: number;
    jobSearchesTotal: number;
    jobSearchesUsed: number;
    billingPeriodEnd: string | null;
    stripeCustomerId: string | null;
}

export interface DebitResult {
    success: boolean;
    remaining: number;
}

// ============================================================================
// ERROR CLASS
// ============================================================================

export class CreditExhaustedError extends Error {
    public remaining: number;
    public upgradeUrl: string;

    constructor(remaining: number) {
        super('CREDITS_EXHAUSTED');
        this.name = 'CreditExhaustedError';
        this.remaining = remaining;
        this.upgradeUrl = '/dashboard/upgrade';
    }
}

export class QuotaExhaustedError extends Error {
    public quotaType: 'coaching' | 'job_search';
    public upgradeUrl: string;

    constructor(quotaType: 'coaching' | 'job_search') {
        super(`${quotaType.toUpperCase()}_QUOTA_EXHAUSTED`);
        this.name = 'QuotaExhaustedError';
        this.quotaType = quotaType;
        this.upgradeUrl = '/dashboard/upgrade';
    }
}

// ============================================================================
// TOPUP LIMITS
// ============================================================================

export const MAX_TOPUPS_PER_MONTH = 2;
export const TOPUP_CREDIT_AMOUNT = 10.0;
