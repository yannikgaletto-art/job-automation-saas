"use client";

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

// --- Types ---

export type ApplicantArchetype = 'builder' | 'strategist' | 'teamplayer' | 'specialist';
export type ToneMode = 'standard' | 'direct' | 'initiative';

export interface PreGenParams {
    applicant_archetype: ApplicantArchetype;
    tone_mode: ToneMode;
}

interface PreGenerationModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (params: PreGenParams) => void;
    jobId?: string;
}

// --- Component ---

export function PreGenerationModal({ open, onClose, onConfirm }: PreGenerationModalProps) {
    const t = useTranslations('video_letter');
    const [step, setStep] = useState(1);
    const [archetype, setArchetype] = useState<ApplicantArchetype | null>(null);
    const [tone, setTone] = useState<ToneMode>('direct');

    const ARCHETYPES = useMemo(() => [
        { id: 'builder' as ApplicantArchetype, label: t('archetype_builder'), description: t('archetype_builder_desc') },
        { id: 'strategist' as ApplicantArchetype, label: t('archetype_strategist'), description: t('archetype_strategist_desc') },
        { id: 'teamplayer' as ApplicantArchetype, label: t('archetype_teamplayer'), description: t('archetype_teamplayer_desc') },
        { id: 'specialist' as ApplicantArchetype, label: t('archetype_specialist'), description: t('archetype_specialist_desc') },
    ], [t]);

    const TONE_OPTIONS = useMemo(() => [
        { id: 'standard' as ToneMode, label: t('tone_standard'), snippet: t('tone_standard_snippet') },
        { id: 'direct' as ToneMode, label: t('tone_direct'), snippet: t('tone_direct_snippet') },
        { id: 'initiative' as ToneMode, label: t('tone_initiative'), snippet: t('tone_initiative_snippet') },
    ], [t]);

    const canNext = step === 1 ? archetype !== null : true;

    const handleConfirm = () => {
        if (!archetype) return;
        onConfirm({
            applicant_archetype: archetype,
            tone_mode: tone,
        });
        setStep(1);
        setArchetype(null);
        setTone('direct');
    };

    const handleClose = () => {
        onClose();
        setStep(1);
        setArchetype(null);
        setTone('direct');
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-[520px] bg-[#FAFAF9] border-[#E7E7E5] p-0 gap-0">
                <DialogTitle className="sr-only">{t('modal_sr_title')}</DialogTitle>

                {/* Progress Dots */}
                <div className="flex items-center justify-center gap-2 pt-6 pb-2">
                    {[1, 2].map(s => (
                        <div
                            key={s}
                            className={cn(
                                'h-2 rounded-full transition-all duration-300',
                                s === step ? 'w-8 bg-[#012e7a]' : s < step ? 'w-2 bg-[#012e7a]/50' : 'w-2 bg-[#D1D5DB]'
                            )}
                        />
                    ))}
                </div>

                {/* Step Content */}
                <div className="px-6 pb-6 min-h-[320px] flex flex-col">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <StepWrapper key="step1">
                                <h3 className="text-lg font-semibold text-[#37352F] mb-1">{t('step1_title')}</h3>
                                <p className="text-sm text-[#73726E] mb-5">{t('step1_subtitle')}</p>
                                <div className="flex flex-col gap-2">
                                    {ARCHETYPES.map(a => (
                                        <button
                                            key={a.id}
                                            onClick={() => setArchetype(a.id)}
                                            className={cn(
                                                'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                                                archetype === a.id
                                                    ? 'border-[#37352F] bg-[#37352F]/5'
                                                    : 'border-[#E7E7E5] bg-white hover:border-[#B4B4B0]'
                                            )}
                                        >
                                            <div className={cn(
                                                'w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                                                archetype === a.id ? 'border-[#012e7a] bg-[#012e7a]' : 'border-[#D1D5DB]'
                                            )}>
                                                {archetype === a.id && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-[#37352F]">{a.label}</p>
                                                <p className="text-xs text-[#73726E]">{a.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </StepWrapper>
                        )}

                        {step === 2 && (
                            <StepWrapper key="step2">
                                <h3 className="text-lg font-semibold text-[#37352F] mb-1">{t('step2_title')}</h3>
                                <p className="text-sm text-[#73726E] mb-5">{t('step2_subtitle')}</p>
                                <div className="flex flex-col gap-2">
                                    {TONE_OPTIONS.map(tone_opt => (
                                        <button
                                            key={tone_opt.id}
                                            onClick={() => setTone(tone_opt.id)}
                                            className={cn(
                                                'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                                                tone === tone_opt.id
                                                    ? 'border-[#37352F] bg-[#37352F]/5'
                                                    : 'border-[#E7E7E5] bg-white hover:border-[#B4B4B0]'
                                            )}
                                        >
                                            <div className={cn(
                                                'w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                                                tone === tone_opt.id ? 'border-[#012e7a] bg-[#012e7a]' : 'border-[#D1D5DB]'
                                            )}>
                                                {tone === tone_opt.id && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-[#37352F]">{tone_opt.label}</p>
                                                <p className="text-xs text-[#73726E] italic">„{tone_opt.snippet}"</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </StepWrapper>
                        )}
                    </AnimatePresence>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-auto pt-5">
                        {step > 1 ? (
                            <button
                                onClick={() => setStep(1)}
                                className="flex items-center gap-1.5 text-sm text-[#73726E] hover:text-[#37352F] transition"
                            >
                                <ChevronLeft className="w-4 h-4" /> {t('nav_back')}
                            </button>
                        ) : <div />}

                        {step === 1 ? (
                            <button
                                onClick={() => setStep(2)}
                                disabled={!canNext}
                                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {t('nav_next')} <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirm}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition"
                            >
                                <Sparkles className="w-4 h-4" /> {t('nav_create_script')}
                            </button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function StepWrapper({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex-1"
        >
            {children}
        </motion.div>
    );
}
