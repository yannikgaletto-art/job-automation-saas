'use client';

/**
 * Credit Dashboard Widget
 * Feature-Silo: billing (NEW)
 *
 * Compact credit display for the dashboard sidebar.
 * Shows plan name, credit progress, and CTAs.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CreditInfo } from '@/lib/services/credit-types';

export function CreditDashboard() {
    const t = useTranslations('billing');
    const [credits, setCredits] = useState<CreditInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCredits() {
            try {
                const res = await fetch('/api/credits');
                if (res.ok) {
                    const data = await res.json();
                    setCredits(data);
                }
            } catch (err) {
                console.error('[CreditDashboard] Failed to fetch credits:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchCredits();
    }, []);

    if (loading) {
        return (
            <div className="rounded-xl border border-border/40 bg-card/50 p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-2/3 mb-3" />
                <div className="h-2 bg-muted rounded w-full mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
            </div>
        );
    }

    if (!credits) return null;

    const usedCredits = credits.creditsUsed;
    const totalCredits = credits.creditsTotal;
    const available = credits.creditsAvailable;
    const progressPct = totalCredits > 0 ? Math.min((usedCredits / totalCredits) * 100, 100) : 0;

    const planLabel = t(`plan_${credits.planType}` as 'plan_free' | 'plan_starter' | 'plan_durchstarter');

    const planEmoji = credits.planType === 'durchstarter' ? '🚀' : credits.planType === 'starter' ? '⚡' : '✨';

    // Color based on usage
    const barColor =
        progressPct > 90 ? 'bg-red-500' :
        progressPct > 70 ? 'bg-amber-500' :
        'bg-emerald-500';

    return (
        <div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3">
            {/* Plan badge */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {planEmoji} {planLabel}
                </span>
                {credits.planType !== 'free' && credits.billingPeriodEnd && (
                    <span className="text-[10px] text-muted-foreground">
                        {t('period_ends', { date: new Date(credits.billingPeriodEnd).toLocaleDateString() })}
                    </span>
                )}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{t('credits_available', { available: available.toFixed(1) })}</span>
                    {credits.topupCredits > 0 && (
                        <span className="text-emerald-500">{t('topup_bonus', { amount: String(credits.topupCredits) })}</span>
                    )}
                </div>
            </div>

            {/* Quotas — shown for all plans (free users have beta quotas too) */}
            {(credits.coachingSessionsTotal > 0 || credits.jobSearchesTotal > 0) && (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {credits.coachingSessionsTotal > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <span>🎯</span>
                            <span>{credits.coachingSessionsUsed}/{credits.coachingSessionsTotal} {t('coaching_label')}</span>
                        </div>
                    )}
                    {credits.jobSearchesTotal > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <span>🔍</span>
                            <span>{credits.jobSearchesUsed}/{credits.jobSearchesTotal} {t('searches_label')}</span>
                        </div>
                    )}
                </div>
            )}

            {/* CTAs */}
            <div className="flex gap-2">
                {credits.planType === 'free' ? (
                    <a
                        href="/dashboard/upgrade"
                        className="flex-1 text-center text-xs font-medium py-1.5 px-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 transition-opacity"
                    >
                        {t('upgrade_cta')}
                    </a>
                ) : (
                    <>
                        {available < 5 && (
                            <button
                                onClick={() => handleTopup()}
                                className="flex-1 text-center text-xs font-medium py-1.5 px-3 rounded-lg border border-border/60 text-foreground hover:bg-muted/30 transition-colors"
                            >
                                {t('topup_cta')}
                            </button>
                        )}
                        <a
                            href="/dashboard/settings"
                            className="text-xs text-muted-foreground hover:text-foreground py-1.5 px-2 transition-colors"
                        >
                            {t('manage_plan')}
                        </a>
                    </>
                )}
            </div>
        </div>
    );

    async function handleTopup() {
        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId: process.env.NEXT_PUBLIC_STRIPE_TOPUP_PRICE }),
            });
            const data = await res.json();
            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            }
        } catch (err) {
            console.error('[CreditDashboard] Topup failed:', err);
        }
    }
}
