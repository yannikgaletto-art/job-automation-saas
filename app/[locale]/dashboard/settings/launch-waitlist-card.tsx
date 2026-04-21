'use client';

/**
 * Launch Waitlist Card — Settings page
 *
 * Lets users pre-register for the Pathly launch.
 * Clicking the CTA expands a pricing accordion showing the plans.
 * Selecting a plan tracks the intent via PostHog and stores it in waitlist_leads.
 */

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

type PlanOption = 'starter' | 'durchstarter' | 'quarterly';

const PLANS: { id: PlanOption; priceLabel: string; period: string }[] = [
    { id: 'starter', priceLabel: '9,90 €', period: '/Monat' },
    { id: 'durchstarter', priceLabel: '19,90 €', period: '/Monat' },
    { id: 'quarterly', priceLabel: '24,90 €', period: '/Quartal' },
];

export function LaunchWaitlistCard() {
    const t = useTranslations('settings.launch_waitlist');
    const locale = useLocale();

    const [expanded, setExpanded] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = useCallback(async () => {
        if (!selectedPlan) return;
        setSubmitting(true);
        setError('');

        try {
            const res = await fetch('/api/waitlist/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: selectedPlan, locale }),
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
    }, [selectedPlan, locale, t]);

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
                    maxHeight: expanded ? '400px' : '0px',
                    opacity: expanded ? 1 : 0,
                }}
            >
                <div className="pt-1 space-y-2">
                    {PLANS.map((plan) => {
                        const isActive = selectedPlan === plan.id;
                        return (
                            <button
                                key={plan.id}
                                onClick={() => setSelectedPlan(plan.id)}
                                className={[
                                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left',
                                    isActive
                                        ? 'border-[#012e7a] bg-[#012e7a]/5 ring-1 ring-[#012e7a]/20'
                                        : 'border-[#E7E7E5] bg-white hover:border-[#012e7a]/30 hover:bg-[#FAFAF9]',
                                ].join(' ')}
                            >
                                <div className="flex items-center gap-3">
                                    {/* Radio indicator */}
                                    <div className={[
                                        'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
                                        isActive ? 'border-[#012e7a] bg-[#012e7a]' : 'border-[#D0D0CE]',
                                    ].join(' ')}>
                                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[#37352F]">
                                            {t(`plan_${plan.id}`)}
                                        </p>
                                        <p className="text-[10px] text-[#73726E] mt-0.5">
                                            {t(`plan_${plan.id}_desc`)}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-sm font-semibold text-[#012e7a] tabular-nums whitespace-nowrap">
                                    {plan.priceLabel}<span className="text-[10px] font-normal text-[#73726E]">{plan.period}</span>
                                </span>
                            </button>
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
