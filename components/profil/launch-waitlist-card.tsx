'use client';

/**
 * Launch Waitlist Card — Profil page
 *
 * Lets users pre-register for the Pathly launch.
 * Clicking the CTA expands a pricing accordion showing the plans.
 * Selecting a plan tracks the intent via PostHog and stores it in waitlist_leads.
 */

import { useState, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

type PlanOption = 'free' | 'starter' | 'durchstarter' | 'quarterly' | 'custom';

const PLANS: { id: PlanOption }[] = [
    { id: 'free' },
    { id: 'starter' },
    { id: 'durchstarter' },
    { id: 'quarterly' },
    { id: 'custom' },
];

const CUSTOM_MIN_EUR = 5;
const CUSTOM_MAX_EUR = 100;
const CUSTOM_CREDITS_PER_EUR = 2.25;

function calculateCustomBenefits(amountEur: number) {
    const boundedAmount = Math.min(CUSTOM_MAX_EUR, Math.max(CUSTOM_MIN_EUR, amountEur));
    const credits = Math.max(5, Math.floor((boundedAmount * CUSTOM_CREDITS_PER_EUR) / 5) * 5);

    return {
        credits,
        coachingSessions: Math.max(1, Math.floor(credits / 3)),
        jobSearches: credits,
    };
}

export function LaunchWaitlistCard() {
    const t = useTranslations('profil.launch_waitlist');
    const locale = useLocale();

    const [expanded, setExpanded] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
    const [customAmountEur, setCustomAmountEur] = useState(15);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const customBenefits = useMemo(
        () => calculateCustomBenefits(customAmountEur),
        [customAmountEur]
    );

    const handleSubmit = useCallback(async () => {
        if (!selectedPlan) return;
        setSubmitting(true);
        setError('');

        try {
            const res = await fetch('/api/waitlist/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: selectedPlan,
                    locale,
                    customAmountEur: selectedPlan === 'custom' ? customAmountEur : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                // Duplicate → treat as success
                if (res.status === 409) {
                    setSubmitted(true);
                    return;
                }
                throw new Error(data.error || 'Request failed');
            }

            setSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('error'));
        } finally {
            setSubmitting(false);
        }
    }, [selectedPlan, locale, customAmountEur, t]);

    // ── Submitted state ───────────────────────────────────────────────
    if (submitted) {
        return (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#012e7a]/5 border border-[#012e7a]/15">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#012e7a]/10 flex items-center justify-center">
                    <Check className="w-4 h-4 text-[#012e7a]" />
                </div>
                <div>
                    <p className="text-sm font-medium text-[#37352F]">{t('success_title')}</p>
                    <p className="text-xs text-[#73726E] mt-0.5">{t('success_desc')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* CTA Button */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#012e7a]/20 bg-[#012e7a]/[0.03] hover:bg-[#012e7a]/[0.06] transition-all group"
            >
                <div className="text-left">
                    <p className="text-sm font-semibold text-[#37352F]">{t('cta_title')}</p>
                    <p className="text-xs text-[#73726E] mt-0.5">{t('cta_desc')}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#73726E] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Pricing Accordion */}
            <div
                className="overflow-hidden transition-all duration-300 ease-out"
                style={{
                    maxHeight: expanded ? '760px' : '0px',
                    opacity: expanded ? 1 : 0,
                }}
            >
                <div className="pt-1 space-y-2">
                    {PLANS.map((plan) => {
                        const isActive = selectedPlan === plan.id;
                        const priceLabel = plan.id === 'custom'
                            ? t('plan_custom_price', { amount: customAmountEur })
                            : t(`plan_${plan.id}_price`);
                        return (
                            <div key={plan.id} className="space-y-2">
                                <button
                                    onClick={() => setSelectedPlan(plan.id)}
                                    className={[
                                        'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all text-left',
                                        isActive
                                            ? 'border-[#012e7a] bg-[#012e7a]/5 ring-1 ring-[#012e7a]/20'
                                            : 'border-[#E7E7E5] bg-white hover:border-[#012e7a]/30 hover:bg-[#FAFAF9]',
                                    ].join(' ')}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        {/* Radio indicator */}
                                        <div className={[
                                            'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
                                            isActive ? 'border-[#012e7a] bg-[#012e7a]' : 'border-[#D0D0CE]',
                                        ].join(' ')}>
                                            {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-[#37352F]">
                                                {t(`plan_${plan.id}`)}
                                            </p>
                                            <p className="text-[10px] text-[#73726E] mt-0.5">
                                                {t(`plan_${plan.id}_desc`)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-semibold text-[#012e7a] tabular-nums whitespace-nowrap">
                                        {priceLabel}<span className="text-[10px] font-normal text-[#73726E]">{t(`plan_${plan.id}_period`)}</span>
                                    </span>
                                </button>

                                {plan.id === 'custom' && isActive && (
                                    <div className="px-4 py-3 rounded-xl border border-[#E7E7E5] bg-[#FAFAF9] space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <label htmlFor="custom-waitlist-amount" className="text-xs font-medium text-[#37352F]">
                                                {t('custom_amount_label')}
                                            </label>
                                            <span className="text-xs font-semibold text-[#012e7a] tabular-nums">
                                                {t('custom_amount_value', { amount: customAmountEur })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                id="custom-waitlist-amount"
                                                type="range"
                                                min={CUSTOM_MIN_EUR}
                                                max={CUSTOM_MAX_EUR}
                                                step={1}
                                                value={customAmountEur}
                                                onChange={(event) => setCustomAmountEur(Number(event.target.value))}
                                                className="w-full accent-[#012e7a]"
                                            />
                                            <input
                                                type="number"
                                                min={CUSTOM_MIN_EUR}
                                                max={CUSTOM_MAX_EUR}
                                                step={1}
                                                value={customAmountEur}
                                                onChange={(event) => {
                                                    const nextValue = Number(event.target.value);
                                                    if (Number.isFinite(nextValue)) {
                                                        setCustomAmountEur(Math.min(CUSTOM_MAX_EUR, Math.max(CUSTOM_MIN_EUR, nextValue)));
                                                    }
                                                }}
                                                aria-label={t('custom_amount_label')}
                                                className="w-16 rounded-lg border border-[#D0D0CE] bg-white px-2 py-1 text-xs text-[#37352F] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20"
                                            />
                                        </div>
                                        <p className="text-[10px] text-[#73726E]">
                                            {t('custom_preview', {
                                                credits: customBenefits.credits,
                                                coaching: customBenefits.coachingSessions,
                                                searches: customBenefits.jobSearches,
                                            })}
                                        </p>
                                        <p className="text-[10px] text-[#B4B4B0]">
                                            {t('custom_range_hint')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Error */}
                    {error && (
                        <p className="text-xs text-red-500 px-1">{error}</p>
                    )}

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedPlan || submitting}
                        className="w-full py-2.5 rounded-xl bg-[#012e7a] hover:bg-[#023a97] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            t('submit')
                        )}
                    </button>

                    <p className="text-[10px] text-[#B4B4B0] text-center leading-relaxed">
                        {t('disclaimer')}
                    </p>
                </div>
            </div>
        </div>
    );
}
