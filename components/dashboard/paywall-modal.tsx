'use client';

/**
 * Paywall Modal
 * Feature-Silo: billing (NEW)
 *
 * Shown when a user tries to use a feature but has no credits/quota left.
 * Handles credit exhaustion, coaching limit, and search limit.
 */

import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { PLAN_CONFIG, TOPUP_CREDIT_AMOUNT } from '@/lib/services/credit-types';

export type PaywallReason = 'credits' | 'coaching' | 'search';

interface PaywallModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reason: PaywallReason;
    remaining?: number;
    quotaTotal?: number; // actual user limit (not plan default)
}

export function PaywallModal({ open, onOpenChange, reason, remaining = 0, quotaTotal }: PaywallModalProps) {
    const t = useTranslations('billing');

    const title =
        reason === 'coaching' ? t('coaching_limit') :
        reason === 'search' ? t('search_limit') :
        t('paywall_title');

    // Use the user's actual quota total if provided, otherwise fall back to planConfig
    const coachingTotal = quotaTotal ?? PLAN_CONFIG.starter.coachingSessions;
    const searchTotal = quotaTotal ?? PLAN_CONFIG.starter.jobSearches;

    const subtitle =
        reason === 'coaching' ? t('coaching_limit_desc', { total: String(coachingTotal) }) :
        reason === 'search' ? t('search_limit_desc', { total: String(searchTotal) }) :
        t('paywall_subtitle', { total: String(remaining) });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-2xl border border-border/40 bg-card p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
                    {/* Icon */}
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
                        <span className="text-3xl">
                            {reason === 'coaching' ? '🎯' : reason === 'search' ? '🔍' : '⚡'}
                        </span>
                    </div>

                    <Dialog.Title className="text-center text-lg font-semibold text-foreground mb-1">
                        {title}
                    </Dialog.Title>
                    <Dialog.Description className="text-center text-sm text-muted-foreground mb-6">
                        {subtitle}
                    </Dialog.Description>

                    {/* Options */}
                    <div className="space-y-3">
                        {/* Topup (only for credit exhaustion) */}
                        {reason === 'credits' && (
                            <button
                                onClick={() => handleTopup()}
                                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
                            >
                                <span className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                    💳
                                </span>
                                <div className="text-left">
                                    <p className="text-sm font-medium text-foreground">{t('paywall_topup_title')}</p>
                                    <p className="text-xs text-muted-foreground">{t('paywall_topup_desc', { amount: String(TOPUP_CREDIT_AMOUNT) })}</p>
                                </div>
                                <span className="ml-auto text-sm font-semibold text-emerald-500">€4,90</span>
                            </button>
                        )}

                        {/* Upgrade */}
                        <a
                            href="/dashboard/upgrade"
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border border-violet-500/20 hover:border-violet-500/40 transition-all group"
                        >
                            <span className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                🚀
                            </span>
                            <div className="text-left">
                                <p className="text-sm font-medium text-foreground">{t('paywall_upgrade_title')}</p>
                                <p className="text-xs text-muted-foreground">{t('paywall_upgrade_desc')}</p>
                            </div>
                            <span className="ml-auto text-xs text-violet-400">→</span>
                        </a>
                    </div>

                    {/* Close */}
                    <Dialog.Close className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
                        {t('dismiss')}
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
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
            console.error('[PaywallModal] Topup failed:', err);
        }
    }
}
