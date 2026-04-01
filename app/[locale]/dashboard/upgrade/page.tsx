'use client';

/**
 * Upgrade Page — In-App Pricing
 * Feature-Silo: billing (NEW)
 *
 * Displays Starter vs Durchstarter plans with feature comparison,
 * monthly/quarterly toggle, and Stripe Checkout integration.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { PLAN_CONFIG } from '@/lib/services/credit-types';

type BillingInterval = 'monthly' | 'quarterly';

interface PlanCard {
    planType: 'starter' | 'durchstarter';
    monthlyPrice: number;
    quarterlyPrice: number;
    monthlyPriceId: string;
    quarterlyPriceId: string;
    popular?: boolean;
}

const PLANS: PlanCard[] = [
    {
        planType: 'starter',
        monthlyPrice: 9.90,
        quarterlyPrice: 8.42, // 15% discount
        monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_MONTHLY_PRICE || '',
        quarterlyPriceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_QUARTERLY_PRICE || '',
    },
    {
        planType: 'durchstarter',
        monthlyPrice: 19.90,
        quarterlyPrice: 16.92, // 15% discount
        monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_DURCHSTARTER_MONTHLY_PRICE || '',
        quarterlyPriceId: process.env.NEXT_PUBLIC_STRIPE_DURCHSTARTER_QUARTERLY_PRICE || '',
        popular: true,
    },
];

export default function UpgradePage() {
    const t = useTranslations('billing');
    const searchParams = useSearchParams();
    const [interval, setInterval] = useState<BillingInterval>('monthly');
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

    const checkoutStatus = searchParams.get('checkout');

    async function handleCheckout(priceId: string, planType: string) {
        if (!priceId) return;
        setLoadingPlan(planType);

        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId }),
            });

            const data = await res.json();

            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            } else {
                console.error('[Upgrade] No checkout URL returned:', data);
                setLoadingPlan(null);
            }
        } catch (err) {
            console.error('[Upgrade] Checkout failed:', err);
            setLoadingPlan(null);
        }
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            {/* Success/Cancel Banners */}
            {checkoutStatus === 'success' && (
                <div className="mb-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
                    <p className="text-sm font-medium text-emerald-400">✅ {t('checkout_success')}</p>
                </div>
            )}
            {checkoutStatus === 'cancelled' && (
                <div className="mb-8 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                    <p className="text-sm font-medium text-amber-400">⚠️ {t('checkout_cancelled')}</p>
                </div>
            )}

            {/* Header */}
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                    {t('upgrade_page_title')}
                </h1>
                <p className="text-muted-foreground">
                    {t('upgrade_page_subtitle')}
                </p>
            </div>

            {/* Interval Toggle */}
            <div className="flex items-center justify-center gap-2 mb-10">
                <button
                    onClick={() => setInterval('monthly')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        interval === 'monthly'
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {t('monthly')}
                </button>
                <button
                    onClick={() => setInterval('quarterly')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                        interval === 'quarterly'
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {t('quarterly')}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                        {t('quarterly_save')}
                    </span>
                </button>
            </div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {PLANS.map((plan) => {
                    const config = PLAN_CONFIG[plan.planType];
                    const price = interval === 'monthly' ? plan.monthlyPrice : plan.quarterlyPrice;
                    const priceId = interval === 'monthly' ? plan.monthlyPriceId : plan.quarterlyPriceId;
                    const isLoading = loadingPlan === plan.planType;

                    return (
                        <div
                            key={plan.planType}
                            className={`relative rounded-2xl border p-6 transition-all hover:shadow-lg ${
                                plan.popular
                                    ? 'border-violet-500/40 bg-gradient-to-b from-violet-500/5 to-transparent shadow-violet-500/10 shadow-lg'
                                    : 'border-border/40 bg-card/50'
                            }`}
                        >
                            {/* Popular badge */}
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider">
                                    {t('popular_badge')}
                                </div>
                            )}

                            {/* Plan name */}
                            <div className="mb-4">
                                <h3 className="text-xl font-bold text-foreground">
                                    {plan.planType === 'durchstarter' ? '🚀' : '⚡'}{' '}
                                    {t(`plan_${plan.planType}` as 'plan_starter' | 'plan_durchstarter')}
                                </h3>
                            </div>

                            {/* Price */}
                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-4xl font-extrabold text-foreground">
                                    €{price.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="text-sm text-muted-foreground">{t('per_month')}</span>
                            </div>

                            {/* Features */}
                            <ul className="space-y-3 mb-8">
                                <Feature text={t('feature_credits', { count: String(config.credits) })} included />
                                <Feature
                                    text={t('feature_coaching', { count: String(config.coachingSessions) })}
                                    included={config.coachingSessions > 0}
                                />
                                <Feature
                                    text={t('feature_searches', { count: String(config.jobSearches) })}
                                    included={config.jobSearches > 0}
                                />
                                <Feature text={t('feature_topup')} included />
                            </ul>

                            {/* CTA */}
                            <button
                                onClick={() => handleCheckout(priceId, plan.planType)}
                                disabled={isLoading || !priceId}
                                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                    plan.popular
                                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 shadow-lg shadow-violet-500/20'
                                        : 'border border-border/60 text-foreground hover:bg-muted/30'
                                }`}
                            >
                                {isLoading ? t('checkout_loading') : t('upgrade_cta')}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Topup Info */}
            <div className="mt-10 text-center">
                <p className="text-sm text-muted-foreground">
                    💡 {t('topup_info')} — {t('topup_cta')}
                </p>
            </div>
        </div>
    );
}

function Feature({ text, included }: { text: string; included: boolean }) {
    return (
        <li className="flex items-center gap-2 text-sm">
            <span className={included ? 'text-emerald-500' : 'text-muted-foreground/40'}>
                {included ? '✓' : '✗'}
            </span>
            <span className={included ? 'text-foreground' : 'text-muted-foreground/60 line-through'}>
                {text}
            </span>
        </li>
    );
}
