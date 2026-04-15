'use client';

/**
 * Paywall Modal — Credits Exhausted
 * Feature-Silo: billing
 *
 * Single-state modal showing options when credits are exhausted:
 *   - Feedback for Credits → navigates to /feedback?credits=true
 *   - Upgrade plan
 *   - One-time topup
 *
 * Triggered globally via CreditExhaustedProvider context.
 */

import { useTranslations } from 'next-intl';
import { PLAN_CONFIG } from '@/lib/services/credit-types';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import type { PaywallReason } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context';

interface PaywallModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reason: PaywallReason;
    remaining?: number;
}

export function PaywallModal({ open, onOpenChange, reason, remaining = 0 }: PaywallModalProps) {
    const t = useTranslations('billing');
    const locale = useLocale();
    const router = useRouter();

    const handleFeedbackNav = () => {
        onOpenChange(false); // close modal
        router.push(`/${locale}/dashboard/feedback?credits=true`);
    };

    const handleTopup = async () => {
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
    };

    // ── Title/subtitle based on reason ─────────────────────────────
    const title =
        reason === 'coaching' ? t('coaching_limit') :
        reason === 'search' ? t('search_limit') :
        t('exhausted_title');

    const subtitle =
        reason === 'coaching' ? t('coaching_limit_desc', { total: String(PLAN_CONFIG.free.coachingSessions) }) :
        reason === 'search' ? t('search_limit_desc', { total: String(PLAN_CONFIG.free.jobSearches) }) :
        t('exhausted_thanks', { total: String(PLAN_CONFIG.free.credits) });

    const icon = reason === 'coaching' ? '🎯' : reason === 'search' ? '🔍' : '⚡';

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-2xl border border-border/40 bg-card p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">

                    <AnimatePresence mode="wait">
                        <motion.div
                            key="exhausted"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Icon */}
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
                                <span className="text-3xl">{icon}</span>
                            </div>

                            <Dialog.Title className="text-center text-lg font-semibold text-foreground mb-1">
                                {title}
                            </Dialog.Title>
                            <Dialog.Description className="text-center text-sm text-muted-foreground mb-6">
                                {subtitle}
                            </Dialog.Description>

                            {/* Options */}
                            <div className="space-y-3">
                                {/* Feedback for Credits → navigates to Feedback Page */}
                                {reason === 'credits' && (
                                    <button
                                        onClick={handleFeedbackNav}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all group"
                                    >
                                        <span className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                            🎁
                                        </span>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-foreground">{t('feedback_cta_title')}</p>
                                            <p className="text-xs text-muted-foreground">{t('feedback_cta_desc')}</p>
                                        </div>
                                        <span className="ml-auto text-sm font-semibold text-emerald-600">+5</span>
                                    </button>
                                )}

                                {/* Upgrade (i18n-aware) */}
                                <a
                                    href={`/${locale}/dashboard/upgrade`}
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

                                {/* Topup (only for credit exhaustion) */}
                                {reason === 'credits' && (
                                    <button
                                        onClick={handleTopup}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-border hover:bg-muted/20 transition-all group"
                                    >
                                        <span className="flex-shrink-0 h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                            💳
                                        </span>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-foreground">{t('paywall_topup_title')}</p>
                                            <p className="text-xs text-muted-foreground">{t('paywall_topup_desc', { amount: '10' })}</p>
                                        </div>
                                        <span className="ml-auto text-sm font-semibold text-muted-foreground">€4,90</span>
                                    </button>
                                )}
                            </div>

                            <Dialog.Close className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
                                {t('dismiss')}
                            </Dialog.Close>
                        </motion.div>
                    </AnimatePresence>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
