'use client';

import { useState, useEffect } from 'react';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse, TonePreset, TargetLanguage } from '@/types/cover-letter-setup';
import { Info, ChevronLeft, Sparkles, Zap, Shield } from 'lucide-react';
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
    const { setTone, setOptInModule, isStepComplete, tone, optInModules } = useCoverLetterSetupStore();
    const [selectedPreset, setSelectedPreset] = useState<TonePreset>(tone?.preset || 'data-driven');
    const [language, setLanguage] = useState<TargetLanguage>(tone?.targetLanguage || setupData.detectedJobLanguage);
    const [contactPerson, setContactPerson] = useState(tone?.contactPerson || '');
    const [formality, setFormality] = useState<'sie' | 'du'>(tone?.formality || 'sie');
    const [first90Days, setFirst90Days] = useState(optInModules?.first90DaysHypothesis ?? false);
    const [vulInjector, setVulInjector] = useState(optInModules?.vulnerabilityInjector ?? false);

    // WHY: formal preset enforces strict 4-paragraph structure + souveräner Ton.
    // first90Days (adds 5th paragraph), vulnerabilityInjector (breaks tone), and pingPong
    // (storytelling element) are structurally/tonally incompatible.
    // CONFLICTS RESOLVED: Formal Tension (Blind Spot #3, QA Report 2026-02-28)
    const isFormal = selectedPreset === 'formal';

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

        // Auto-reset incompatible modules when switching TO formal
        // User is aware they'll need to re-enable if switching back — confirmed as cleanest approach.
        if (preset === 'formal') {
            setFirst90Days(false);
            setOptInModule('first90DaysHypothesis', false);
            setVulInjector(false);
            setOptInModule('vulnerabilityInjector', false);
            setOptInModule('pingPong', false);
        }
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

            {/* First 90 Days Hypothesis Toggle */}
            <div className={`border border-[#E7E7E5] rounded-lg p-3 bg-white ${isFormal ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-[#37352F]">First 90 Days Plan</p>
                            <p className="text-[10px] text-[#73726E] mt-0.5 leading-relaxed">
                                {isFormal
                                    ? 'Beim formellen Stil wird auf zusätzliche Absätze verzichtet, um die klassische 4-Absatz-Struktur beizubehalten.'
                                    : 'KI generiert einen konkreten 3-Punkte-Plan für deine ersten 90 Tage — basierend auf echten Firmenproblemen.'}
                            </p>
                        </div>
                    </div>
                    <button
                        id="toggle-first90days"
                        role="switch"
                        aria-checked={first90Days && !isFormal}
                        disabled={isFormal}
                        onClick={() => {
                            if (isFormal) return;
                            const next = !first90Days;
                            setFirst90Days(next);
                            setOptInModule('first90DaysHypothesis', next);
                        }}
                        style={{ minWidth: '2.75rem', width: '2.75rem', height: '1.5rem', borderRadius: '9999px', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s', backgroundColor: first90Days && !isFormal ? '#002e7a' : '#D1D5DB', border: 'none', cursor: isFormal ? 'not-allowed' : 'pointer', padding: 0 }}
                    >
                        <span
                            style={{
                                position: 'absolute',
                                top: '3px',
                                left: first90Days && !isFormal ? 'calc(100% - 19px)' : '3px',
                                width: '18px',
                                height: '18px',
                                backgroundColor: 'white',
                                borderRadius: '9999px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                transition: 'left 0.2s',
                            }}
                        />
                    </button>
                </div>
            </div>

            {/* Vulnerability Injector Toggle */}
            <div className={`border border-[#E7E7E5] rounded-lg p-3 bg-white ${isFormal ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-[#8B5CF6] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-[#37352F]">Vulnerability Injector</p>
                            <p className="text-[10px] text-[#73726E] mt-0.5 leading-relaxed">
                                {isFormal
                                    ? 'Der formelle Stil erfordert einen durchgehend souveränen Ton ohne strategische Schwächen.'
                                    : 'Baut 1-2 strategische, authentische Lernkurven ein — zeigt Selbstbewusstsein und Wachstum.'}
                            </p>
                        </div>
                    </div>
                    <button
                        id="toggle-vulnerability"
                        role="switch"
                        aria-checked={vulInjector && !isFormal}
                        disabled={isFormal}
                        onClick={() => {
                            if (isFormal) return;
                            const next = !vulInjector;
                            setVulInjector(next);
                            setOptInModule('vulnerabilityInjector', next);
                        }}
                        style={{ minWidth: '2.75rem', width: '2.75rem', height: '1.5rem', borderRadius: '9999px', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s', backgroundColor: vulInjector && !isFormal ? '#002e7a' : '#D1D5DB', border: 'none', cursor: isFormal ? 'not-allowed' : 'pointer', padding: 0 }}
                    >
                        <span
                            style={{
                                position: 'absolute',
                                top: '3px',
                                left: vulInjector && !isFormal ? 'calc(100% - 19px)' : '3px',
                                width: '18px',
                                height: '18px',
                                backgroundColor: 'white',
                                borderRadius: '9999px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                transition: 'left 0.2s',
                            }}
                        />
                    </button>
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
