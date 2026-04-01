/**
 * Stripe Service — Configuration & Helpers
 * Feature-Silo: billing (NEW)
 *
 * Central Stripe configuration. All Stripe API calls go through this module.
 */

import Stripe from 'stripe';
import { PLAN_CONFIG, type PlanType } from '@/lib/services/credit-types';

// ============================================================================
// STRIPE CLIENT
// ============================================================================

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
    if (!stripeInstance) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key || key === 'sk_test_xxx') {
            throw new Error('STRIPE_SECRET_KEY is not configured. Set it in .env.local');
        }
        stripeInstance = new Stripe(key, {
            apiVersion: '2026-03-25.dahlia',
            typescript: true,
        });
    }
    return stripeInstance;
}

// ============================================================================
// PRICE IDS (from Stripe Dashboard — set in .env.local)
// ============================================================================

export const STRIPE_PRICES = {
    starter_monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE || '',
    starter_quarterly: process.env.STRIPE_STARTER_QUARTERLY_PRICE || '',
    durchstarter_monthly: process.env.STRIPE_DURCHSTARTER_MONTHLY_PRICE || '',
    durchstarter_quarterly: process.env.STRIPE_DURCHSTARTER_QUARTERLY_PRICE || '',
    topup: process.env.STRIPE_TOPUP_PRICE || '',
} as const;

// ============================================================================
// PLAN MAPPING
// ============================================================================

/** Map a Stripe price ID to a PlanType */
export function priceIdToPlan(priceId: string): PlanType | null {
    if (priceId === STRIPE_PRICES.starter_monthly || priceId === STRIPE_PRICES.starter_quarterly) {
        return 'starter';
    }
    if (priceId === STRIPE_PRICES.durchstarter_monthly || priceId === STRIPE_PRICES.durchstarter_quarterly) {
        return 'durchstarter';
    }
    return null;
}

/** Get plan config by plan type */
export function getPlanConfig(planType: PlanType) {
    return PLAN_CONFIG[planType];
}

// ============================================================================
// CHECKOUT HELPERS
// ============================================================================

export interface CheckoutOptions {
    priceId: string;
    mode: 'subscription' | 'payment';
    userId: string;
    customerEmail: string;
    stripeCustomerId?: string;
    successUrl: string;
    cancelUrl: string;
}

export async function createCheckoutSession(options: CheckoutOptions): Promise<string> {
    const stripe = getStripe();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: options.mode,
        line_items: [{ price: options.priceId, quantity: 1 }],
        success_url: options.successUrl,
        cancel_url: options.cancelUrl,
        metadata: { userId: options.userId },
        automatic_tax: { enabled: true },
    };

    // Attach existing customer or set email for new customer
    if (options.stripeCustomerId) {
        sessionParams.customer = options.stripeCustomerId;
    } else {
        sessionParams.customer_email = options.customerEmail;
    }

    // For subscriptions, allow plan changes
    if (options.mode === 'subscription') {
        sessionParams.subscription_data = {
            metadata: { userId: options.userId },
        };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
        throw new Error('Stripe checkout session created but no URL returned');
    }

    return session.url;
}

// ============================================================================
// PORTAL HELPER
// ============================================================================

export async function createPortalSession(stripeCustomerId: string, returnUrl: string): Promise<string> {
    const stripe = getStripe();

    const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
    });

    return session.url;
}
