'use client';

/**
 * Paywall Modal — Credits Exhausted + Beta Fake-Door
 * Feature-Silo: billing
 *
 * Three-phase modal:
 *   Phase 1 "pricing":   Shows upgrade/topup/feedback options (tracks intent)
 *   Phase 2 "granting":  Loading spinner while /api/billing/beta-grant runs
 *   Phase 3 "surprise":  Confetti + "Credits refilled" celebration
 *
 * In Beta mode (BETA_CREDIT_MODE=true), clicking Upgrade or Topup
 * triggers the beta-grant flow instead of Stripe checkout.
 * The PostHog event "upgrade_intent" captures the plan the user
 * would have paid for — this is the monetization validation KPI.
 *
 * Triggered globally via CreditExhaustedProvider context.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { PLAN_CONFIG } from '@/lib/services/credit-types';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { PaywallReason } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context';

type ModalPhase = 'pricing' | 'granting' | 'surprise';

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

    const [phase, setPhase] = useState<ModalPhase>('pricing');
    const [refilledAmount, setRefilledAmount] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const isMountedRef = useRef(true);

    // Track mount state to prevent setState after unmount (memory leak)
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Reset phase when modal closes — guarded against unmount
    const handleOpenChange = useCallback((isOpen: boolean) => {
        onOpenChange(isOpen);
        if (!isOpen) {
            // Delay reset to allow close animation; guard against unmount
            setTimeout(() => {
                if (isMountedRef.current) {
                    setPhase('pricing');
                    setErrorMsg('');
                }
            }, 250);
        }
    }, [onOpenChange]);

    // ── Feedback navigation ─────────────────────────────────────────
    const handleFeedbackNav = () => {
        handleOpenChange(false);
        router.push(`/${locale}/dashboard/feedback?credits=true`);
    };

    // ── Beta Grant (replaces Stripe checkout) ───────────────────────
    const handleBetaGrant = useCallback(async (plan: 'starter' | 'durchstarter' | 'topup') => {
        if (!isMountedRef.current) return;
        setPhase('granting');
        setErrorMsg('');

        // AbortController: 15s timeout — prevents infinite spinner
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15_000);

        try {
            const res = await fetch('/api/billing/beta-grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!isMountedRef.current) return;

            // Already claimed
            if (res.status === 409) {
                setErrorMsg(t('beta_already_claimed'));
                setPhase('pricing');
                return;
            }

            // Beta mode not active — future Stripe fallback point
            if (res.status === 404) {
                setErrorMsg(t('beta_unavailable'));
                setPhase('pricing');
                return;
            }

            const data = await res.json();

            if (!res.ok || !data.success) {
                setErrorMsg(t('feedback_error'));
                setPhase('pricing');
                return;
            }

            // Guard: if user had 0 credits used, show plan credits instead
            const refilled = typeof data.refilledAmount === 'number' && data.refilledAmount > 0
                ? data.refilledAmount
                : PLAN_CONFIG.free.credits;
            setRefilledAmount(refilled);

            // 🎉 Confetti — lazy-loaded, non-blocking
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({
                    particleCount: 80,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0, y: 0.7 },
                    colors: ['#012e7a', '#A8C4E6', '#00B870'],
                });
                setTimeout(() => confetti({
                    particleCount: 80,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1, y: 0.7 },
                    colors: ['#012e7a', '#A8C4E6', '#00B870'],
                }), 200);
            }).catch(() => { /* confetti is cosmetic — ignore errors */ });

            if (isMountedRef.current) setPhase('surprise');

        } catch (err: unknown) {
            clearTimeout(timeoutId);
            if (!isMountedRef.current) return;
            // AbortError = timeout
            const isTimeout = err instanceof Error && err.name === 'AbortError';
            setErrorMsg(isTimeout ? t('beta_timeout') : t('feedback_error'));
            setPhase('pricing');
        }
    }, [t]);

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
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-2xl border border-border/40 bg-card p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">

                    <AnimatePresence mode="wait">
                        {/* ── Phase 1: Pricing Options ─────────────────────── */}
                        {phase === 'pricing' && (
                            <motion.div
                                key="pricing"
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

                                {/* Error banner */}
                                {errorMsg && (
                                    <div className="mb-4 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-600 text-center">
                                        {errorMsg}
                                    </div>
                                )}

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

                                    {/* Upgrade → Beta Grant (tracks "upgrade_intent_starter") */}
                                    <button
                                        onClick={() => handleBetaGrant('starter')}
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
                                    </button>

                                    {/* Topup → Beta Grant (tracks "upgrade_intent_topup") */}
                                    {reason === 'credits' && (
                                        <button
                                            onClick={() => handleBetaGrant('topup')}
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
                        )}

                        {/* ── Phase 2: Granting (loading) ──────────────────── */}
                        {phase === 'granting' && (
                            <motion.div
                                key="granting"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="py-10 flex flex-col items-center gap-4"
                            >
                                <Dialog.Title className="sr-only">{t('beta_granting')}</Dialog.Title>
                                <Dialog.Description className="sr-only">{t('beta_granting')}</Dialog.Description>
                                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                                <p className="text-sm text-muted-foreground">{t('beta_granting')}</p>
                            </motion.div>
                        )}

                        {/* ── Phase 3: Surprise! ───────────────────────────── */}
                        {phase === 'surprise' && (
                            <motion.div
                                key="surprise"
                                initial={{ opacity: 0, scale: 0.9, y: 12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                                className="py-6 text-center"
                            >
                                {/* Animated icon — clean SVG, no emoji */}
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                    className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#012e7a]/10"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#012e7a"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="w-8 h-8"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </motion.div>

                                <Dialog.Title className="text-xl font-bold text-foreground mb-2">
                                    {t('beta_surprise_title')}
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground mb-6 max-w-[32ch] mx-auto">
                                    {t('beta_surprise_body')}
                                </Dialog.Description>

                                {/* Credits badge — no emoji */}
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-700 px-5 py-2.5 rounded-full text-sm font-semibold mb-6"
                                >
                                    {t('beta_surprise_credits', { amount: String(refilledAmount) })}
                                </motion.div>

                                <button
                                    onClick={() => handleOpenChange(false)}
                                    className="w-full py-3 rounded-xl bg-[#012e7a] hover:bg-[#023a97] text-white text-sm font-semibold transition-colors"
                                >
                                    {t('beta_surprise_cta')}
                                </button>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
