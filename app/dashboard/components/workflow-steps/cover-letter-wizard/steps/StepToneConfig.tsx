'use client';

import { useState, useEffect } from 'react';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse, TonePreset, TargetLanguage } from '@/types/cover-letter-setup';
import { Info, ChevronLeft, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    setupData: SetupDataResponse;
    onBack: () => void;
    onGenerate: () => void;
}

const toneOptions: { id: TonePreset; label: string; desc: string; previewText: string }[] = [
    {
        id: 'data-driven',
        label: '📊 Daten-getrieben',
        desc: 'Zahlen, Fakten, konkrete Ergebnisse',
        previewText: '„Ich konnte den Umsatz im B2B-Segment um 15% steigern — durch systematische Optimierung der Vertriebsprozesse."',
    },
    {
        id: 'storytelling',
        label: '📖 Storytelling',
        desc: 'Narrative, persönliche Geschichte',
        previewText: '„Als ich zum ersten Mal die Herausforderungen im B2B-Sales sah, wusste ich: Hier kann ich wirklich etwas bewegen."',
    },
    {
        id: 'formal',
        label: '🎩 Formal',
        desc: 'Klassisch, strukturiert, konservativ',
        previewText: '„Meine bisherige Laufbahn ist geprägt durch erfolgreiche Abschlüsse im strategischen Vertrieb."',
    },
    {
        id: 'philosophisch',
        label: '🔮 Philosophisch',
        desc: 'Konzeptionell, reflektiert, intellektuell',
        previewText: '„Wachstum entsteht dort, wo bewährte Prozesse hinterfragt und neu gedacht werden."',
    },
];

export function StepToneConfig({ setupData, onBack, onGenerate }: Props) {
    const { setTone, isStepComplete, tone } = useCoverLetterSetupStore();
    const [selectedPreset, setSelectedPreset] = useState<TonePreset>(tone?.preset || 'data-driven');
    const [language, setLanguage] = useState<TargetLanguage>(tone?.targetLanguage || setupData.detectedJobLanguage);
    const [contactPerson, setContactPerson] = useState(tone?.contactPerson || '');
    const [formality, setFormality] = useState<'sie' | 'du'>(tone?.formality || 'sie');

    // Ensure the store always has a valid tone on mount (for default selection)
    useEffect(() => {
        if (!tone?.preset) {
            setTone({
                preset: selectedPreset,
                targetLanguage: language,
                hasStyleSample: setupData.hasStyleSample,
                styleWarningAcknowledged: true,
                contactPerson,
                formality,
            });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const canGenerate = isStepComplete(3);

    const handlePresetSelect = (preset: TonePreset) => {
        setSelectedPreset(preset);
        setTone({
            preset,
            targetLanguage: language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: true,
            contactPerson,
            formality,
        });
    };

    const handleLanguageChange = (lang: TargetLanguage) => {
        setLanguage(lang);
        setTone({
            preset: selectedPreset,
            targetLanguage: lang,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: true,
            contactPerson,
            formality,
        });
    };

    const handleContactPersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setContactPerson(val);
        setTone({
            preset: selectedPreset,
            targetLanguage: language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: true,
            contactPerson: val,
            formality,
        });
    };

    const handleFormalityChange = (f: 'sie' | 'du') => {
        setFormality(f);
        setTone({
            preset: selectedPreset,
            targetLanguage: language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: true,
            contactPerson,
            formality: f,
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">Ton & Sprache</h3>
                    <p className="text-xs text-[#73726E] mt-0.5">{setupData.styleAnalysisSummary}</p>
                </div>

                {/* Language Toggle */}
                <div className="flex items-center gap-0.5 bg-[#E7E7E5] rounded-md p-0.5">
                    {(['de', 'en'] as const).map((lang) => (
                        <button
                            key={lang}
                            onClick={() => handleLanguageChange(lang)}
                            className={[
                                'px-2 py-1 rounded text-xs font-semibold transition-all',
                                language === lang ? 'bg-white text-[#002e7a] shadow-sm' : 'text-[#73726E]',
                            ].join(' ')}
                        >
                            {lang === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tone Options with Micro-Preview */}
            <div className="grid grid-cols-1 gap-2">
                {toneOptions.map((opt) => {
                    const isActive = selectedPreset === opt.id;
                    return (
                        <button
                            key={opt.id}
                            onClick={() => handlePresetSelect(opt.id)}
                            className={[
                                'text-left px-3 py-2.5 rounded-lg border transition-all',
                                isActive
                                    ? 'border-2 border-[#002e7a] bg-[#f0f4ff]'
                                    : 'border border-[#E7E7E5] bg-white hover:shadow-sm',
                            ].join(' ')}
                        >
                            <p className="text-xs font-semibold text-[#37352F]">{opt.label}</p>
                            <p className="text-[10px] text-[#73726E] mt-0.5">{opt.desc}</p>

                            {/* Micro-Preview — animated */}
                            <AnimatePresence>
                                {isActive && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mt-2 pt-2 border-t border-[#D0DEFF]">
                                            <p className="text-[11px] text-[#5A7AB5] italic leading-snug">
                                                {opt.previewText}
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </button>
                    );
                })}
            </div>

            {/* Contact Person Input */}
            <div className="pt-2">
                <label className="block text-xs font-semibold text-[#37352F] mb-1">
                    Ansprechpartner <span className="text-[#A8A29E] font-normal">(optional)</span>
                </label>
                <input
                    type="text"
                    value={contactPerson}
                    onChange={handleContactPersonChange}
                    placeholder="z.B. Herr Müller, HR Team"
                    className="w-full border border-[#E7E7E5] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#002e7a]"
                />
            </div>

            {/* Du/Sie Toggle — YC Style */}
            {language === 'de' && (
                <div className="pt-2">
                    <label className="block text-xs font-semibold text-[#37352F] mb-1.5">
                        Anrede im Unternehmen
                    </label>
                    <div className="flex items-center gap-0.5 bg-[#E7E7E5] rounded-md p-0.5 w-fit">
                        {([{ value: 'sie' as const, label: 'Sie-Form (Klassisch)' }, { value: 'du' as const, label: 'Du-Form (Startups/Tech)' }]).map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => handleFormalityChange(opt.value)}
                                className={[
                                    'px-3 py-1.5 rounded text-xs font-semibold transition-all',
                                    formality === opt.value ? 'bg-white text-[#002e7a] shadow-sm' : 'text-[#73726E]',
                                ].join(' ')}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Streamlined Style Callout — no checkbox */}
            <div className="bg-[#EEF3FF] border-l-4 border-[#002e7a] rounded-md p-3">
                <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#002e7a] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#37352F] leading-relaxed">
                        {setupData.hasStyleSample
                            ? 'Dein persönlicher Schreibstil wurde analysiert. Die KI kalibriert sich auf deine Stimme.'
                            : 'Lade ein altes Anschreiben in den Settings hoch, damit die KI deinen Stil lernt. Bis dahin nutzen wir den gewählten Ton.'}
                    </p>
                </div>
            </div>

            <div className="flex justify-between pt-2">
                <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                    <ChevronLeft className="w-3.5 h-3.5" /> Zurück
                </button>
                <button
                    onClick={onGenerate}
                    disabled={!canGenerate}
                    className={[
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                        canGenerate
                            ? 'bg-[#002e7a] text-white hover:bg-[#001e5a]'
                            : 'bg-[#E7E7E5] text-[#A8A29E] cursor-not-allowed',
                    ].join(' ')}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Anschreiben generieren
                </button>
            </div>
        </div>
    );
}
