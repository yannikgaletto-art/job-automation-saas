'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { SlideToActionButton } from '@/components/motion/slide-action-button';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 2;

const GOAL_OPTIONS = [
    { key: 'active_applications', labelKey: 'goal_applications' },
    { key: 'personalization', labelKey: 'goal_personalization' },
    { key: 'exploring', labelKey: 'goal_exploring' },
    { key: 'interview_prep', labelKey: 'goal_interview' },
] as const;

// Animation sequence timing (ms from start):
// [0]  welcome greeting                          →     0ms  (immediate)
// [1]  label_before + all 3 before lines         →  1500ms  (after greeting is read)
// [2]  (same as 1)                               →  1500ms
// [3]  (same as 1)                               →  1500ms
// [4]  (same as 1)                               →  1500ms
// [5]  label_after + all 3 after lines           →  4500ms  (+3s pause)
// [6]  (same as 5)                               →  4500ms
// [7]  (same as 5)                               →  4500ms
// [8]  (same as 5)                               →  4500ms
// [9]  Question toggle                           →  7500ms  (+3s pause)
// [10] Goal 1                                    →  7800ms
// [11] Goal 2                                    →  8100ms
// [12] Goal 3                                    →  8400ms
// [13] Goal 4                                    →  8700ms
const SEQUENCE_DELAYS = [0, 1500, 1500, 1500, 1500, 4500, 4500, 4500, 4500, 7500, 7800, 8100, 8400, 8700];
const TOTAL_SEQUENCE_ITEMS = SEQUENCE_DELAYS.length;

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
    const t = useTranslations('onboarding');
    return (
        <div className="flex items-center justify-center gap-2 py-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        i + 1 <= current ? 'bg-[#002e7a] scale-110' : 'bg-[#E7E7E5]'
                    }`}
                />
            ))}
            <span className="ml-3 text-xs text-[#94a3b8]">
                {t('step_indicator', { current, total: TOTAL_STEPS })}
            </span>
        </div>
    );
}

// ─── Slide animation variants ─────────────────────────────────────────────────
const slideVariants = {
    enter: { opacity: 0, x: 80 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -80 },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const router = useRouter();
    const locale = useLocale();
    const t = useTranslations('onboarding');
    const [step, setStep] = useState(1);
    const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [aiProcessingAccepted, setAiProcessingAccepted] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [completionError, setCompletionError] = useState<string | null>(null);

    // ✅ Mount-guard: if already completed → skip to dashboard
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/onboarding/status');
                const data = await res.json() as { completed: boolean };
                if (data.completed) router.replace('/dashboard');
            } catch {
                // Non-blocking
            }
        };
        checkStatus();
    }, []);

    const next = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS)), []);

    const toggleGoal = useCallback((key: string) => {
        setSelectedGoals((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    }, []);

    const allConsentsGiven = privacyAccepted && aiProcessingAccepted;

    const handleComplete = async () => {
        if (!allConsentsGiven || completing) return;
        setCompleting(true);
        setCompletionError(null);

        try {
            const res = await fetch('/api/onboarding/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 2,
                    language: locale,
                    onboarding_goals: selectedGoals,
                    consents: [
                        { document_type: 'privacy_policy', document_version: 'v1.0', consent_given: true },
                        { document_type: 'ai_processing', document_version: 'v2.0', consent_given: true },
                        // Art. 9 DSGVO: CV photos are NOT special-category data (no biometric processing)
                        // → no separate consent required. Checkbox removed per CISO review April 2026.
                    ],
                }),
            });
            const data = await res.json() as { success: boolean; error?: string; waitlisted?: boolean };

            if (!res.ok || !data.success) {
                setCompletionError(t('step2.error_save'));
                setCompleting(false);
                return;
            }

            // §WAITLIST: If cohort is full, redirect to waitlist page
            if (data.waitlisted) {
                router.push('/dashboard/waitlist');
                return;
            }

            // Signal to dashboard that user just finished onboarding → trigger guided tour
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('pathly_show_post_onboarding_tour', '1');
                // Clear stale keys from previous accounts in same browser
                sessionStorage.removeItem('pathly_confetti_fired');
                ['goals', 'job-queue', 'job-search', 'coaching'].forEach(
                    tab => localStorage.removeItem(`pathly_tour_completed_${tab}`)
                );
                localStorage.removeItem('pathly_welcome_confetti_shown');
            }

            router.push('/dashboard');
        } catch (err) {
            console.error('[Onboarding] Network error:', err);
            setCompletionError(t('step2.error_network'));
            setCompleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
            {/* Header — intentionally empty (brand removed per design) */}
            <header className="px-8 pt-6 pb-2" />

            {/* Progress indicator */}
            <StepIndicator current={step} />

            {/* Step content */}
            <div className="flex-1 flex items-start justify-center px-4 pt-4">
                <div className="w-full max-w-lg">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step-1"
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
                                <Step1Goals
                                    selectedGoals={selectedGoals}
                                    onToggleGoal={toggleGoal}
                                    onNext={next}
                                />
                            </motion.div>
                        )}
                        {step === 2 && (
                            <motion.div
                                key="step-2"
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
                                <Step2Consent
                                    privacyAccepted={privacyAccepted}
                                    aiProcessingAccepted={aiProcessingAccepted}
                                    onTogglePrivacy={() => setPrivacyAccepted((v) => !v)}
                                    onToggleAI={() => setAiProcessingAccepted((v) => !v)}
                                    onComplete={handleComplete}
                                    completing={completing}
                                    error={completionError}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

// ─── Shared Button ────────────────────────────────────────────────────────────

function StepButton({
    onClick,
    disabled,
    children,
}: {
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            disabled={disabled}
            className="w-full py-3.5 bg-[#002e7a] text-white border-none rounded-xl text-sm font-semibold cursor-pointer tracking-tight hover:bg-[#001d4f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
            {children}
        </motion.button>
    );
}

// ─── Step 1: Sequential Animated Text + Goals ─────────────────────────────────

function Step1Goals({
    selectedGoals,
    onToggleGoal,
    onNext,
}: {
    selectedGoals: string[];
    onToggleGoal: (key: string) => void;
    onNext: () => void;
}) {
    const t = useTranslations('onboarding.step1');

    // Fetch user's first name for the personalized greeting
    const [firstName, setFirstName] = useState('');
    useEffect(() => {
        import('@/lib/supabase/client').then(({ createClient }) => {
            const supabase = createClient();
            supabase.auth.getUser().then(({ data }) => {
                const raw = data.user?.user_metadata?.full_name as string | undefined;
                // Extract first name: take everything before first space
                if (raw) setFirstName(raw.split(' ')[0]);
            });
        });
    }, []);

    // visible[i] = true when item i should appear
    const [visible, setVisible] = useState<boolean[]>(
        Array(TOTAL_SEQUENCE_ITEMS).fill(false)
    );

    // State-driven sequential reveal — reliable in all browsers, no CSS-delay issues
    useEffect(() => {
        const timers: ReturnType<typeof setTimeout>[] = [];
        SEQUENCE_DELAYS.forEach((delay, i) => {
            timers.push(
                setTimeout(() => {
                    setVisible((prev) => {
                        const next = [...prev];
                        next[i] = true;
                        return next;
                    });
                }, delay)
            );
        });
        return () => timers.forEach(clearTimeout);
    }, []);

    const [toggleOpen, setToggleOpen] = useState(false);

    const fadeIn: React.CSSProperties = {
        transition: 'opacity 400ms ease-out, transform 400ms ease-out',
    };
    const show: React.CSSProperties = { opacity: 1, transform: 'translateY(0)' };
    const hide: React.CSSProperties = { opacity: 0, transform: 'translateY(8px)' };

    return (
        <div className="bg-white rounded-2xl shadow-lg p-8">

            {/* ── Welcome greeting ───────────────────────────── */}
            <p
                style={{ ...fadeIn, ...(visible[0] ? show : hide) }}
                className="text-base font-semibold text-[#37352F] mb-6"
            >
                {t('welcome', { name: firstName || '👋' })}
            </p>

            {/* ── Before section ─────────────────────────────── */}

            {/* Label: bold, grey, uppercase */}
            <p
                style={{ ...fadeIn, ...(visible[1] ? show : hide) }}
                className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest mb-3"
            >
                {t('label_before')}
            </p>

            {/* Before lines: normal weight */}
            <div className="mb-8 space-y-1.5">
                <p style={{ ...fadeIn, ...(visible[2] ? show : hide) }} className="text-sm text-[#94a3b8] font-normal">
                    {t('before_line_1')}
                </p>
                <p style={{ ...fadeIn, ...(visible[3] ? show : hide) }} className="text-sm text-[#94a3b8] font-normal">
                    {t('before_line_2')}
                </p>
                <p style={{ ...fadeIn, ...(visible[4] ? show : hide) }} className="text-sm text-[#94a3b8] font-normal">
                    {t('before_line_3')}
                </p>
            </div>

            {/* ── After section ──────────────────────────────── */}

            {/* Label: bold, navy, uppercase */}
            <p
                style={{ ...fadeIn, ...(visible[5] ? show : hide) }}
                className="text-xs font-bold text-[#002e7a] uppercase tracking-widest mb-3"
            >
                {t('label_after')}
            </p>

            {/* After lines: normal weight (user request) */}
            <div className="mb-10 space-y-1.5">
                <p style={{ ...fadeIn, ...(visible[6] ? show : hide) }} className="text-sm text-[#002e7a] font-normal">
                    {t('after_line_1')}
                </p>
                <p style={{ ...fadeIn, ...(visible[7] ? show : hide) }} className="text-sm text-[#002e7a] font-normal">
                    {t('after_line_2')}
                </p>
                <p style={{ ...fadeIn, ...(visible[8] ? show : hide) }} className="text-sm text-[#002e7a] font-normal">
                    {t('after_line_3')}
                </p>
            </div>

            {/* ── Question: Notion-style toggle ──────────────── */}

            <div style={{ ...fadeIn, ...(visible[9] ? show : hide) }}>
                {/* Toggle header */}
                <button
                    onClick={() => setToggleOpen((o) => !o)}
                    className="flex items-center gap-2 mb-4 group w-full text-left"
                >
                    <motion.span
                        animate={{ rotate: toggleOpen ? 90 : 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="text-[#94a3b8] group-hover:text-[#37352F] transition-colors flex-shrink-0"
                    >
                        {/* Notion-style triangle chevron */}
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                                d="M6 4l4 4-4 4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </motion.span>
                    <span className="text-base font-semibold text-[#0f172a] group-hover:text-[#002e7a] transition-colors">
                        {t('question')}
                    </span>
                </button>

                {/* Collapsible goals — smooth Notion-style expand */}
                <AnimatePresence initial={false}>
                    {toggleOpen && (
                        <motion.div
                            key="goals-content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div className="space-y-2 mb-6 pl-6">
                                {GOAL_OPTIONS.map((goal, idx) => {
                                    const isSelected = selectedGoals.includes(goal.key);
                                    // Goals appear one by one: visible[10..13]
                                    const goalVisible = visible[10 + idx];
                                    return (
                                        <label
                                            key={goal.key}
                                            style={{ ...fadeIn, ...(goalVisible ? show : hide) }}
                                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-colors duration-200 ${
                                                isSelected
                                                    ? 'border-[#002e7a] bg-[#002e7a]/5'
                                                    : 'border-[#E7E7E5] hover:border-[#002e7a]/30'
                                            }`}
                                        >
                                            <div
                                                className={`rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                    isSelected
                                                        ? 'bg-[#002e7a] border-[#002e7a]'
                                                        : 'border-[#D6D6D3] bg-white'
                                                }`}
                                                style={{ width: '18px', height: '18px' }}
                                            >
                                                {isSelected && (
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggleGoal(goal.key)}
                                                className="sr-only"
                                            />
                                            <span className="text-sm text-[#37352F]">{t(goal.labelKey)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* CTA always visible — independent of toggle state */}
                <div className="mt-6">
                    <StepButton onClick={onNext}>{t('button')}</StepButton>
                </div>
            </div>
        </div>
    );
}

// ─── Step 2: DSGVO Consent — Trust Block + 2 Checkboxen ──────────────────────

const TRUST_POINTS = [
    { titleKey: 'trust_1_title', detailKey: 'trust_1_detail' },
    { titleKey: 'trust_2_title', detailKey: 'trust_2_detail' },
    { titleKey: 'trust_3_title', detailKey: 'trust_3_detail' },
] as const;

function Step2Consent({
    privacyAccepted,
    aiProcessingAccepted,
    onTogglePrivacy,
    onToggleAI,
    onComplete,
    completing,
    error,
}: {
    privacyAccepted: boolean;
    aiProcessingAccepted: boolean;
    onTogglePrivacy: () => void;
    onToggleAI: () => void;
    onComplete: () => void;
    completing: boolean;
    error: string | null;
}) {
    const t = useTranslations('onboarding.step2');
    const allAccepted = privacyAccepted && aiProcessingAccepted;

    return (
        <div className="bg-white rounded-2xl shadow-lg p-8">
            {/* Title + Description — left-aligned */}
            <h2 className="text-xl font-bold text-[#0f172a] mb-2">
                {t('title')}
            </h2>
            <p className="text-sm text-[#64748b] leading-relaxed mb-8">
                {t('description')}
            </p>

            {/* Trust Block — 3 technical facts, no borders */}
            <div className="space-y-5 mb-8">
                {TRUST_POINTS.map((point) => (
                    <div key={point.titleKey} className="flex gap-3">
                        {/* Checkmark */}
                        <svg className="w-5 h-5 text-[#002e7a] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <div>
                            <p className="text-sm font-medium text-[#0f172a]">{t(point.titleKey)}</p>
                            <p className="text-xs text-[#94a3b8] mt-0.5">{t(point.detailKey)}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Divider */}
            <div className="border-t border-[#E7E7E5] mb-6" />

            {/* Consent Checkboxes — 2 only (no TOS) */}
            <div className="space-y-3 mb-8 text-left">
                {/* Privacy Policy */}
                <label className={`flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border transition-colors ${
                    privacyAccepted ? 'border-[#002e7a] bg-[#002e7a]/5' : 'border-[#E7E7E5] hover:border-[#002e7a]/30'
                }`}>
                    <div
                        className={`rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                            privacyAccepted ? 'bg-[#002e7a] border-[#002e7a]' : 'border-[#D6D6D3] bg-white'
                        }`}
                        style={{ width: '18px', height: '18px' }}
                    >
                        {privacyAccepted && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                    <input type="checkbox" checked={privacyAccepted} onChange={onTogglePrivacy} className="sr-only" />
                    <span
                        className="text-sm text-[#37352F]"
                        dangerouslySetInnerHTML={{
                            __html: t.raw('privacy_label')
                                .replace('<privacyLink>', '<a href="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" class="text-[#002e7a] underline hover:text-[#001d4f]">')
                                .replace('</privacyLink>', '</a>'),
                        }}
                    />
                </label>

                {/* AI Processing */}
                <label className={`flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border transition-colors ${
                    aiProcessingAccepted ? 'border-[#002e7a] bg-[#002e7a]/5' : 'border-[#E7E7E5] hover:border-[#002e7a]/30'
                }`}>
                    <div
                        className={`rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                            aiProcessingAccepted ? 'bg-[#002e7a] border-[#002e7a]' : 'border-[#D6D6D3] bg-white'
                        }`}
                        style={{ width: '18px', height: '18px' }}
                    >
                        {aiProcessingAccepted && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                    <input type="checkbox" checked={aiProcessingAccepted} onChange={onToggleAI} className="sr-only" />
                    <span
                        className="text-sm text-[#37352F]"
                        dangerouslySetInnerHTML={{
                            __html: t.raw('ai_label')
                                .replace('<aiLink>', '<a href="/legal/ai-processing" target="_blank" rel="noopener noreferrer" class="text-[#002e7a] underline hover:text-[#001d4f]">')
                                .replace('</aiLink>', '</a>'),
                        }}
                    />
                </label>
                {/* Art. 9 DSGVO: No special-category checkbox needed — CV photos are not
                    biometric data under Art. 9. Removed per CISO review April 2026. */}
            </div>

            {/* CTA — Slide-to-action for premium feel */}
            <SlideToActionButton
                text={completing ? t('submitting') : t('submit')}
                disabled={!allAccepted || completing}
                onAction={onComplete}
            />
            {error && (
                <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
            )}
        </div>
    );
}
