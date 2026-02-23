'use client';

import { useState } from 'react';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse, TonePreset, TargetLanguage } from '@/types/cover-letter-setup';
import { Info, ChevronLeft, Sparkles } from 'lucide-react';

interface Props {
    setupData: SetupDataResponse;
    onBack: () => void;
    onGenerate: () => void;
}

const toneOptions: { id: TonePreset; label: string; desc: string }[] = [
    { id: 'data-driven', label: '📊 Daten-getrieben', desc: 'Zahlen, Fakten, konkrete Ergebnisse' },
    { id: 'storytelling', label: '📖 Storytelling', desc: 'Narrative, persönliche Geschichte' },
    { id: 'formal', label: '🎩 Formal', desc: 'Klassisch, strukturiert, konservativ' },
];

export function StepToneConfig({ setupData, onBack, onGenerate }: Props) {
    const { setTone, isStepComplete, tone } = useCoverLetterSetupStore();
    const [selectedPreset, setSelectedPreset] = useState<TonePreset>(tone?.preset || 'data-driven');
    const [language, setLanguage] = useState<TargetLanguage>(tone?.targetLanguage || setupData.detectedJobLanguage);
    const [contactPerson, setContactPerson] = useState(tone?.contactPerson || '');
    const [acknowledged, setAcknowledged] = useState(tone?.styleWarningAcknowledged || false);

    const handleAcknowledge = () => {
        const newAck = !acknowledged;
        setAcknowledged(newAck);
        setTone({
            preset: selectedPreset,
            targetLanguage: language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: newAck,
            contactPerson,
        });
    };

    const handlePresetSelect = (preset: TonePreset) => {
        setSelectedPreset(preset);
        setTone({
            preset,
            targetLanguage: language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: acknowledged,
            contactPerson,
        });
    };

    const handleLanguageChange = (lang: TargetLanguage) => {
        setLanguage(lang);
        setTone({
            preset: selectedPreset,
            targetLanguage: lang,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: acknowledged,
            contactPerson,
        });
    };

    const handleContactPersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setContactPerson(val);
        setTone({
            preset: selectedPreset,
            targetLanguage: language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: acknowledged,
            contactPerson: val,
        });
    };

    const canGenerate = isStepComplete(3);

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

            {/* Tone Options */}
            <div className="grid grid-cols-1 gap-2">
                {toneOptions.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => handlePresetSelect(opt.id)}
                        className={[
                            'text-left px-3 py-2.5 rounded-lg border transition-all',
                            selectedPreset === opt.id
                                ? 'border-2 border-[#002e7a] bg-[#f0f4ff]'
                                : 'border border-[#E7E7E5] bg-white hover:shadow-sm',
                        ].join(' ')}
                    >
                        <p className="text-xs font-semibold text-[#37352F]">{opt.label}</p>
                        <p className="text-[10px] text-[#73726E] mt-0.5">{opt.desc}</p>
                    </button>
                ))}
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

            {/* Anti-GPT Callout */}
            <div className="bg-[#EEF3FF] border-l-4 border-[#002e7a] rounded-md p-4">
                <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#002e7a] shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-[#002e7a]">Wichtig: Deine Schreibstimme</p>
                        <p className="text-xs text-[#37352F] leading-relaxed mt-1">
                            Wir kalibrieren Claude auf DEINE Schreibweise aus deinem hochgeladenen Anschreiben.
                            Falls dein Text bereits GPT-typische Formulierungen enthält, wird das Ergebnis genauso klingen.
                            Wähle zusätzlich einen Stil, der zur Unternehmenskultur passt — aber immer in deiner Stimme.
                        </p>
                        {!setupData.hasStyleSample && (
                            <p className="text-[10px] text-amber-600 mt-1.5">
                                ⚠️ Kein altes Anschreiben hochgeladen — Standardstil wird verwendet.
                            </p>
                        )}
                    </div>
                </div>

                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={handleAcknowledge}
                        className="rounded border-[#002e7a] text-[#002e7a] w-3.5 h-3.5"
                    />
                    <span className="text-xs text-[#37352F]">Ich habe das verstanden</span>
                </label>
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
