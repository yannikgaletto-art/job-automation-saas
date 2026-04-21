/**
 * Credit System — Type Definitions
 * Feature-Silo: billing (NEW)
 *
 * Shared types for credit service, credit gate, and Stripe webhooks.
 */

// ============================================================================
// PLAN DEFINITIONS
// ============================================================================

// ⚠️ SYNC: Free-plan defaults below are also hardcoded in the DB trigger:
//   supabase/migrations/20260415b_fix_signup_trigger.sql → create_user_credits()
//   If you change values here, you MUST update the trigger SQL and deploy it.
export const PLAN_CONFIG = {
    free: {
        credits: 5.0,        // Free Trial: 5 credits (~2 full applications)
        coachingSessions: 3,  // 3 coaching sessions ("Reinschnuppern")
        jobSearches: 3,       // 3 unique SerpAPI queries (stays within SerpAPI Free Tier)
        label: 'Free',
    },
    starter: {
        credits: 30.0,       // Starter: full month of applications
        coachingSessions: 10, // Serious interview prep
        jobSearches: 30,
        label: 'Starter',
    },
    durchstarter: {
        credits: 75.0,       // Durchstarter: intensive job search
        coachingSessions: 25, // Interview bootcamp
        jobSearches: 75,
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
    | 'admin_adjustment'
    | 'feedback_bonus'
    | 'beta_refill'
    | 'referral_bonus';

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
