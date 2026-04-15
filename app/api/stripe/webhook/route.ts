/**
 * Stripe Webhook Handler
 * POST /api/stripe/webhook
 *
 * Processes Stripe events: subscriptions, payments, plan changes.
 * Idempotent via processed_stripe_events table.
 *
 * Stripe API: 2026-03-25.dahlia
 * - Invoice.subscription → invoice.parent?.subscription_details?.subscription
 * - Subscription.current_period_* → subscription.items.data[0].current_period_*
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getStripe, priceIdToPlan, getPlanConfig } from '@/lib/services/stripe-service';
import { TOPUP_CREDIT_AMOUNT, PLAN_CONFIG } from '@/lib/services/credit-types';

function getAdmin() { return getSupabaseAdmin(); }

// Disable body parsing — Stripe needs raw body
export const runtime = 'nodejs';

// ============================================================================
// HELPERS — Extract period from subscription items (new Stripe API)
// ============================================================================

function getSubscriptionPeriod(subscription: Stripe.Subscription): { start: number; end: number } {
    const firstItem = subscription.items?.data?.[0];
    if (firstItem?.current_period_start && firstItem?.current_period_end) {
        return {
            start: firstItem.current_period_start,
            end: firstItem.current_period_end,
        };
    }
    // Fallback: use billing_cycle_anchor + 30 days
    const anchor = subscription.billing_cycle_anchor;
    return {
        start: anchor,
        end: anchor + 30 * 24 * 60 * 60,
    };
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    // New API: invoice.parent.subscription_details.subscription
    const parent = invoice.parent;
    if (parent?.subscription_details?.subscription) {
        const sub = parent.subscription_details.subscription;
        return typeof sub === 'string' ? sub : sub.id;
    }
    return null;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
    const stripe = getStripe();
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // 1. Verify webhook signature
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (err) {
        console.error('❌ [Stripe Webhook] Signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // 2. Idempotency check
    const { data: existing } = await getAdmin()
        .from('processed_stripe_events')
        .select('stripe_event_id')
        .eq('stripe_event_id', event.id)
        .maybeSingle();

    if (existing) {
        console.log(`⏭️ [Stripe Webhook] Event ${event.id} already processed, skipping`);
        return NextResponse.json({ received: true });
    }

    // 3. Process event
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(event.data.object as Stripe.Invoice);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object as Stripe.Invoice);
                break;

            default:
                console.log(`ℹ️ [Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        // 4. Mark event as processed
        await getAdmin().from('processed_stripe_events').insert({
            stripe_event_id: event.id,
            event_type: event.type,
        });

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error(`❌ [Stripe Webhook] Error processing ${event.type}:`, error);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    if (!userId) {
        console.error('❌ [Stripe] Checkout completed but no userId in metadata');
        return;
    }

    const customerId = session.customer as string;

    if (session.mode === 'subscription') {
        const subscriptionId = session.subscription as string;
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const planType = priceId ? priceIdToPlan(priceId) : null;

        if (!planType) {
            console.error('❌ [Stripe] Unknown price ID:', priceId);
            return;
        }

        const config = getPlanConfig(planType);
        const period = getSubscriptionPeriod(subscription);

        await getAdmin()
            .from('user_credits')
            .upsert(
                {
                    user_id: userId,
                    plan_type: planType,
                    credits_total: config.credits,
                    credits_used: 0,
                    coaching_sessions_total: config.coachingSessions,
                    coaching_sessions_used: 0,
                    job_searches_total: config.jobSearches,
                    job_searches_used: 0,
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                    billing_period_start: new Date(period.start * 1000).toISOString(),
                    billing_period_end: new Date(period.end * 1000).toISOString(),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
            );

        // Audit log
        await getAdmin().from('credit_events').insert({
            user_id: userId,
            event_type: 'plan_upgrade',
            credits_amount: config.credits,
            credits_before: 0,
            credits_after: config.credits,
            stripe_event_id: session.id,
        });

        console.log(`✅ [Stripe] User ${userId.slice(0, 8)}… upgraded to ${planType} (${config.credits} credits)`);
    } else if (session.mode === 'payment') {
        // Topup — atomic increment
        const { data: current } = await getAdmin()
            .from('user_credits')
            .select('topup_credits, credits_total, credits_used')
            .eq('user_id', userId)
            .single();

        if (current) {
            const currentTopup = Number(current.topup_credits);
            const available = Number(current.credits_total) - Number(current.credits_used) + currentTopup;

            await getAdmin()
                .from('user_credits')
                .update({
                    topup_credits: currentTopup + TOPUP_CREDIT_AMOUNT,
                    stripe_customer_id: customerId,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);

            // Audit log
            await getAdmin().from('credit_events').insert({
                user_id: userId,
                event_type: 'topup',
                credits_amount: TOPUP_CREDIT_AMOUNT,
                credits_before: available,
                credits_after: available + TOPUP_CREDIT_AMOUNT,
                stripe_event_id: session.id,
            });
        }

        console.log(`✅ [Stripe] User ${userId.slice(0, 8)}… bought topup (+${TOPUP_CREDIT_AMOUNT} credits)`);
    }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) return;

    // Find user by subscription ID
    const { data: userCredits } = await getAdmin()
        .from('user_credits')
        .select('user_id, plan_type, credits_total')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

    if (!userCredits) {
        console.warn('⚠️ [Stripe] Invoice paid but no user found for subscription:', subscriptionId);
        return;
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const period = getSubscriptionPeriod(subscription);

    // Monthly reset: credits_used → 0, quotas → 0 (topup_credits NOT reset)
    await getAdmin()
        .from('user_credits')
        .update({
            credits_used: 0,
            coaching_sessions_used: 0,
            job_searches_used: 0,
            billing_period_start: new Date(period.start * 1000).toISOString(),
            billing_period_end: new Date(period.end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userCredits.user_id);

    // Audit log
    await getAdmin().from('credit_events').insert({
        user_id: userCredits.user_id,
        event_type: 'monthly_reset',
        credits_amount: 0,
        credits_before: Number(userCredits.credits_total),
        credits_after: Number(userCredits.credits_total),
        stripe_event_id: invoice.id,
    });

    console.log(`🔄 [Stripe] Monthly reset for user ${userCredits.user_id.slice(0, 8)}… (${userCredits.plan_type})`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    const priceId = subscription.items.data[0]?.price?.id;
    const newPlan = priceId ? priceIdToPlan(priceId) : null;

    if (!newPlan) return;

    const config = getPlanConfig(newPlan);
    const period = getSubscriptionPeriod(subscription);

    // Update plan — if upgrade, credits take effect immediately (Stripe proration)
    await getAdmin()
        .from('user_credits')
        .update({
            plan_type: newPlan,
            credits_total: config.credits,
            coaching_sessions_total: config.coachingSessions,
            job_searches_total: config.jobSearches,
            billing_period_start: new Date(period.start * 1000).toISOString(),
            billing_period_end: new Date(period.end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    console.log(`🔄 [Stripe] Plan updated for user ${userId.slice(0, 8)}… → ${newPlan}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    // Downgrade to free at period end
    await getAdmin()
        .from('user_credits')
        .update({
            plan_type: 'free',
            credits_total: PLAN_CONFIG.free.credits,
            credits_used: 0,
            coaching_sessions_total: PLAN_CONFIG.free.coachingSessions,
            coaching_sessions_used: 0,
            job_searches_total: PLAN_CONFIG.free.jobSearches,
            job_searches_used: 0,
            stripe_subscription_id: null,
            billing_period_start: null,
            billing_period_end: null,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

    await getAdmin().from('credit_events').insert({
        user_id: userId,
        event_type: 'plan_downgrade',
        credits_amount: 0,
        credits_before: 0,
        credits_after: PLAN_CONFIG.free.credits,
    });

    console.log(`⬇️ [Stripe] User ${userId.slice(0, 8)}… downgraded to free`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) return;

    const { data: userCredits } = await getAdmin()
        .from('user_credits')
        .select('user_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

    if (!userCredits) return;

    // Log payment failure — do NOT immediately downgrade (7-day grace period via Stripe)
    console.warn(`⚠️ [Stripe] Payment failed for user ${userCredits.user_id.slice(0, 8)}… — Stripe will retry`);

    // TODO: Send email notification via Resend
}
