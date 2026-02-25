'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, Chrome, Plus, Search, Mail, CheckCircle2, Upload } from 'lucide-react';

import { DocumentUpload } from '@/components/onboarding/document-upload';

// ─── Step Definitions ─────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 py-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i + 1 <= current
                        ? 'bg-[#002e7a] scale-110'
                        : 'bg-[#E7E7E5]'
                        }`}
                />
            ))}
            <span className="ml-3 text-xs text-[#94a3b8]">
                Schritt {current} von {TOTAL_STEPS}
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
    const [step, setStep] = useState(1);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [aiProcessingAccepted, setAiProcessingAccepted] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [completing, setCompleting] = useState(false);

    // Confetti on mount (Step 1)
    useEffect(() => {
        if (step === 1) {
            import('canvas-confetti').then(({ default: confetti }) => {
                const duration = 2000;
                const end = Date.now() + duration;

                const frame = () => {
                    confetti({
                        particleCount: 3,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0, y: 0.7 },
                        colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'],
                    });
                    confetti({
                        particleCount: 3,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1, y: 0.7 },
                        colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'],
                    });
                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                };
                frame();
            });
        }
    }, [step]);

    const next = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS)), []);

    const allConsentsGiven = privacyAccepted && aiProcessingAccepted && termsAccepted;

    const handleComplete = async () => {
        if (!allConsentsGiven || completing) return;
        setCompleting(true);

        try {
            const res = await fetch('/api/onboarding/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 6 }),
            });

            if (!res.ok) {
                console.error('[Onboarding] Complete failed:', await res.text());
            }
        } catch (err) {
            console.error('[Onboarding] Network error:', err);
        }

        router.push('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
            {/* Header */}
            <header className="px-8 pt-6 pb-2">
                <div className="text-[#37352F] font-bold text-xl tracking-tight">
                    Pathly
                </div>
            </header>

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
                                <Step1Welcome onNext={next} />
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
                                <Step2QuickStart onNext={next} />
                            </motion.div>
                        )}
                        {step === 3 && (
                            <motion.div
                                key="step-3"
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
                                <Step3JobQueue onNext={next} />
                            </motion.div>
                        )}
                        {step === 4 && (
                            <motion.div
                                key="step-4"
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
                                <DocumentUpload
                                    introHeadline="Damit wir wissen, wie du schreibst"
                                    introText="Um dein CV und Cover Letter wirklich auf jede Stelle abzustimmen, ist es wichtig, dass wir sehen wie du schreibst — und was dir wichtig ist. Lade deinen aktuellen CV und ein Anschreiben hoch. Du kannst sie jederzeit in den Settings aktualisieren."
                                    onComplete={async (files) => {
                                        try {
                                            const formData = new FormData()
                                            formData.append('cv', files.cv)
                                            files.coverLetters.forEach((file, index) => {
                                                formData.append(`coverLetter_${index}`, file)
                                            })

                                            const response = await fetch('/api/documents/upload', {
                                                method: 'POST',
                                                body: formData
                                            })

                                            if (!response.ok) {
                                                const errorData = await response.json().catch(() => ({}))
                                                console.error("Onboarding upload failed:", errorData)
                                                // We don't throw here to not block the onboarding flow completely,
                                                // but we'll still advance the step. Ideally we'd show a toast.
                                            }
                                        } catch (error) {
                                            console.error('Onboarding upload error:', error)
                                        }
                                        setStep(5);
                                    }}
                                    onBack={() => setStep(3)}
                                />
                                <div className="text-center mt-2">
                                    <button
                                        onClick={() => setStep(5)}
                                        className="text-sm text-gray-400 hover:text-gray-600 mt-3 underline"
                                    >
                                        Jetzt überspringen — später in Settings hochladen
                                    </button>
                                </div>
                            </motion.div>
                        )}
                        {step === 5 && (
                            <motion.div
                                key="step-5"
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
                                <Step5Feedback onNext={next} />
                            </motion.div>
                        )}
                        {step === 6 && (
                            <motion.div
                                key="step-6"
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                            >
                                <Step6Consent
                                    privacyAccepted={privacyAccepted}
                                    aiProcessingAccepted={aiProcessingAccepted}
                                    termsAccepted={termsAccepted}
                                    onTogglePrivacy={() => setPrivacyAccepted((v) => !v)}
                                    onToggleAI={() => setAiProcessingAccepted((v) => !v)}
                                    onToggleTerms={() => setTermsAccepted((v) => !v)}
                                    onComplete={handleComplete}
                                    completing={completing}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
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

function Step1Welcome({ onNext }: { onNext: () => void }) {
    return (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-[#0f172a] mb-6">
                Willkommen bei Pathly
            </h1>
            <div className="bg-[#f8fafc] rounded-xl p-6 mb-8 text-left">
                <p className="text-sm text-[#334155] leading-relaxed">
                    Pathly ist entstanden, weil ich ChatGPT zu generisch fand und ich nicht mehr
                    zwischen verschiedenen Seiten suchen, Text einbetten und 10x iterieren wollte.
                    Pathly ist mein kleiner Workspace mit Pomodoro, den ich mit dir teilen
                    {' '}m&ouml;chte &mdash; und hoffe, dass du etwas Freude daran finden kannst.
                </p>
            </div>
            <StepButton onClick={onNext}>Los geht&apos;s &rarr;</StepButton>
        </div>
    );
}

function Step2QuickStart({ onNext }: { onNext: () => void }) {
    const cards = [
        {
            icon: Chrome,
            title: 'Chrome Extension',
            desc: 'Scrape Jobs direkt auf LinkedIn oder StepStone in Pathly. (Extension folgt bald \u2014 bis dahin: Add Job per Copy-Paste)',
        },
        {
            icon: Plus,
            title: 'Add Job',
            desc: 'Kopiere den Text einer Stellenanzeige und f\u00fcge ihn in \u201eAdd Job\u201c ein. Pathly analysiert ihn automatisch.',
        },
        {
            icon: Search,
            title: 'Job Suche',
            desc: 'Suche \u00fcber Job Search nach passenden Stellen und f\u00fcge sie mit einem Klick in deine Queue ein.',
        },
    ];

    return (
        <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-[#0f172a] mb-6 text-center">
                Schnellstart-Hinweise
            </h2>
            <div className="space-y-4 mb-8">
                {cards.map((card) => (
                    <div
                        key={card.title}
                        className="flex items-start gap-4 p-4 rounded-xl bg-[#f8fafc] border border-[#E7E7E5]"
                    >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#002e7a]/10 flex items-center justify-center">
                            <card.icon className="w-5 h-5 text-[#002e7a]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-[#0f172a] mb-1">{card.title}</h3>
                            <p className="text-xs text-[#64748b] leading-relaxed">{card.desc}</p>
                        </div>
                    </div>
                ))}
            </div>
            <StepButton onClick={onNext}>Verstanden &rarr;</StepButton>
        </div>
    );
}

function Step3JobQueue({ onNext }: { onNext: () => void }) {
    return (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#002e7a]/10 flex items-center justify-center mx-auto mb-6">
                <Briefcase className="w-8 h-8 text-[#002e7a]" />
            </div>
            <h2 className="text-xl font-bold text-[#0f172a] mb-4">
                Dein Bewerbungs-Cockpit
            </h2>
            <p className="text-sm text-[#64748b] leading-relaxed mb-8">
                In der Job Queue helfen wir dir, CV und Cover Letter auf jede Stelle
                abzustimmen und deine Erfolgschancen gezielt zu erh&ouml;hen.
            </p>
            <StepButton onClick={onNext}>Klingt gut &rarr;</StepButton>
        </div>
    );
}

function Step5Feedback({ onNext }: { onNext: () => void }) {
    return (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#002e7a]/10 flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-[#002e7a]" />
            </div>
            <h2 className="text-xl font-bold text-[#0f172a] mb-4">
                Feedback
            </h2>
            <p className="text-sm text-[#64748b] leading-relaxed mb-4">
                Wir verbessern Pathly st&auml;ndig. Wenn dir etwas fehlt oder du dir etwas
                w&uuml;nschst &mdash; ich freue mich &uuml;ber dein Feedback:
            </p>
            <a
                href="mailto:yannik.galetto@gmail.com"
                className="inline-block text-sm font-medium text-[#002e7a] hover:underline mb-8"
            >
                yannik.galetto@gmail.com
            </a>
            <StepButton onClick={onNext}>Danke &rarr;</StepButton>
        </div>
    );
}

function Step6Consent({
    privacyAccepted,
    aiProcessingAccepted,
    termsAccepted,
    onTogglePrivacy,
    onToggleAI,
    onToggleTerms,
    onComplete,
    completing,
}: {
    privacyAccepted: boolean;
    aiProcessingAccepted: boolean;
    termsAccepted: boolean;
    onTogglePrivacy: () => void;
    onToggleAI: () => void;
    onToggleTerms: () => void;
    onComplete: () => void;
    completing: boolean;
}) {
    const allAccepted = privacyAccepted && aiProcessingAccepted && termsAccepted;

    return (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#002e7a]/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-[#002e7a]" />
            </div>
            <h2 className="text-xl font-bold text-[#0f172a] mb-4">
                Datenschutz best&auml;tigen
            </h2>
            <p className="text-sm text-[#64748b] leading-relaxed mb-6">
                Bitte lies unsere Datenschutzerkl&auml;rung und best&auml;tige dein Einverst&auml;ndnis.
            </p>

            <div className="space-y-3 mb-8 text-left">
                {/* Checkbox 1: Privacy Policy */}
                <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border border-[#E7E7E5] hover:border-[#002e7a]/30 transition-colors">
                    <input
                        type="checkbox"
                        checked={privacyAccepted}
                        onChange={onTogglePrivacy}
                        className="w-4 h-4 mt-0.5 rounded border-[#D6D6D3] text-[#002e7a] focus:ring-[#002e7a] cursor-pointer"
                    />
                    <span className="text-sm text-[#37352F]">
                        Ich habe die{' '}
                        <a href="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#002e7a] underline hover:text-[#001d4f]">
                            Datenschutzerkl&auml;rung
                        </a>{' '}
                        gelesen und stimme zu.
                    </span>
                </label>

                {/* Checkbox 2: AI Processing */}
                <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border border-[#E7E7E5] hover:border-[#002e7a]/30 transition-colors">
                    <input
                        type="checkbox"
                        checked={aiProcessingAccepted}
                        onChange={onToggleAI}
                        className="w-4 h-4 mt-0.5 rounded border-[#D6D6D3] text-[#002e7a] focus:ring-[#002e7a] cursor-pointer"
                    />
                    <span className="text-sm text-[#37352F]">
                        Ich stimme der Verarbeitung meiner Daten durch{' '}
                        <a href="/legal/ai-processing" target="_blank" rel="noopener noreferrer" className="text-[#002e7a] underline hover:text-[#001d4f]">
                            KI-Dienste
                        </a>{' '}
                        zu.
                    </span>
                </label>

                {/* Checkbox 3: Terms of Service */}
                <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border border-[#E7E7E5] hover:border-[#002e7a]/30 transition-colors">
                    <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={onToggleTerms}
                        className="w-4 h-4 mt-0.5 rounded border-[#D6D6D3] text-[#002e7a] focus:ring-[#002e7a] cursor-pointer"
                    />
                    <span className="text-sm text-[#37352F]">
                        Ich akzeptiere die{' '}
                        <a href="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-[#002e7a] underline hover:text-[#001d4f]">
                            Nutzungsbedingungen
                        </a>.
                    </span>
                </label>
            </div>

            <StepButton onClick={onComplete} disabled={!allAccepted || completing}>
                {completing ? 'Wird gespeichert...' : 'Loslegen'}
            </StepButton>
        </div>
    );
}
