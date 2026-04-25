'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse, TonePreset, TargetLanguage } from '@/types/cover-letter-setup';
import { Info, ChevronLeft, Sparkles, Zap, Shield, FileText, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { DocumentsRequiredDialog } from '@/components/shared/documents-required-dialog';

interface Props {
    setupData: SetupDataResponse;
    onBack: () => void;
    onGenerate: () => void;
}

const toneOptionIds: TonePreset[] = ['storytelling', 'formal'];

function formatDate(dateStr: string, locale: string) {
    return new Date(dateStr).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function StepToneConfig({ setupData, onBack, onGenerate }: Props) {
    const t = useTranslations('cover_letter');
    const locale = useLocale();
    const { setTone, setOptInModule, isStepComplete, tone, optInModules } = useCoverLetterSetupStore();

    const toneOptions = useMemo(() => toneOptionIds.map(id => {
        const key = id.replace(/-/g, '_') as 'tone_storytelling' | 'tone_formal';
        return {
            id,
            label: t(`tone_${key}` as typeof key),
            desc: t(`tone_${key}_desc` as `${typeof key}_desc`),
            previewText: t(`tone_${key}_preview` as `${typeof key}_preview`),
        };
    }), [t]);
    const [selectedPreset, setSelectedPreset] = useState<TonePreset>(tone?.preset || 'storytelling');
    const [language, setLanguage] = useState<TargetLanguage>(tone?.targetLanguage || setupData.detectedJobLanguage);
    const [contactPerson, setContactPerson] = useState(tone?.contactPerson || '');
    const [formality, setFormality] = useState<'sie' | 'du'>(tone?.formality || 'sie');
    const [first90Days, setFirst90Days] = useState(optInModules?.first90DaysHypothesis ?? false);
    const [vulInjector, setVulInjector] = useState(optInModules?.vulnerabilityInjector ?? false);

    // ─── Tone Source Feature ─────────────────────────────────────────
    const [toneSource, setToneSource] = useState<'preset' | 'custom-style'>(tone?.toneSource || 'preset');
    const [selectedDocId, setSelectedDocId] = useState<string | undefined>(tone?.selectedStyleDocId);
    const [showDocPicker, setShowDocPicker] = useState(false);
    const [pendingDocId, setPendingDocId] = useState<string | undefined>(undefined);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [showCoverLetterRequired, setShowCoverLetterRequired] = useState(false);

    const availableDocs = setupData.availableStyleDocs || [];
    const hasUploadedDocs = availableDocs.length > 0;
    const docsWithStyle = availableDocs.filter(d => d.hasStyleAnalysis);

    const [analyzedDocIds, setAnalyzedDocIds] = useState<Set<string>>(
        () => new Set(availableDocs.filter(d => d.hasStyleAnalysis).map(d => d.id))
    );

    // ─── Orphaned Reference Guard (QA Blind Spot #3) ─────────────────
    // If the stored selectedDocId no longer exists (user deleted it in Settings),
    // reset to 'preset' mode and clear the dead reference.
    useEffect(() => {
        if (toneSource === 'custom-style' && selectedDocId) {
            const stillExists = availableDocs.some(d => d.id === selectedDocId);
            if (!stillExists) {
                console.warn('⚠️ [ToneConfig] Selected style doc was deleted — resetting to preset');
                setToneSource('preset');
                setSelectedDocId(undefined);
                syncTone('preset', selectedPreset, undefined);
            }
        }
    }, [availableDocs]); // eslint-disable-line react-hooks/exhaustive-deps

    // WHY: formal preset enforces strict 4-paragraph structure + souveräner Ton.
    const isFormal = selectedPreset === 'formal';

    // Ensure the store always has a valid tone on mount (for default selection)
    // FIX: Only initialize if tone is completely absent. Previously this would
    // overwrite a persisted targetLanguage='en' with the local `language` state
    // (initialized from setupData.detectedJobLanguage='de' for German jobs).
    useEffect(() => {
        if (!tone?.preset && !tone?.targetLanguage) {
            syncTone(toneSource, selectedPreset, selectedDocId);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const canGenerate = isStepComplete(3);

    // Centralized tone sync to store — avoids repeating setTone() in every handler
    const syncTone = (
        source: 'preset' | 'custom-style',
        preset: TonePreset,
        docId?: string,
        overrides?: { lang?: TargetLanguage; contact?: string; form?: 'sie' | 'du' }
    ) => {
        setTone({
            preset,
            toneSource: source,
            selectedStyleDocId: docId,
            targetLanguage: overrides?.lang ?? language,
            hasStyleSample: setupData.hasStyleSample,
            styleWarningAcknowledged: true,
            contactPerson: overrides?.contact ?? contactPerson,
            formality: overrides?.form ?? formality,
        });
    };

    // ─── Tone Source Toggle Handler ─────────────────────────────────
    const handleToneSourceChange = (source: 'preset' | 'custom-style') => {
        setToneSource(source);

        if (source === 'custom-style') {
            // Fix: Ghost-Preset — reset hidden preset to data-driven
            if (selectedPreset === 'formal') {
                setSelectedPreset('storytelling');
            }
            // Always open the picker so user can choose/confirm
            setShowDocPicker(true);
            // Auto-select only if exactly 1 doc AND already have style — picker confirms it
            if (docsWithStyle.length === 1) {
                const doc = docsWithStyle[0];
                setSelectedDocId(doc.id);
                syncTone('custom-style', selectedPreset === 'formal' ? 'storytelling' : selectedPreset, doc.id);
            }
        } else {
            setSelectedDocId(undefined);
            syncTone('preset', selectedPreset, undefined);
        }
    };

    const handleDocSelect = (docId: string) => {
        setSelectedDocId(docId);
        setShowDocPicker(false);
        setPendingDocId(undefined);
        setAnalyzeError(null);
        syncTone('custom-style', selectedPreset, docId);
    };

    const handleDocConfirm = async () => {
        if (!pendingDocId) return;
        const isAnalyzed = analyzedDocIds.has(pendingDocId);
        if (isAnalyzed) {
            handleDocSelect(pendingDocId);
            return;
        }
        // Trigger style analysis
        setIsAnalyzing(true);
        setAnalyzeError(null);
        try {
            const res = await fetch('/api/cover-letter/analyze-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId: pendingDocId }),
            });
            if (res.ok) {
                setAnalyzedDocIds(prev => new Set([...prev, pendingDocId]));
                handleDocSelect(pendingDocId);
            } else {
                const data = await res.json().catch(() => ({}));
                setAnalyzeError(data.error || t('error_analyze'));
            }
        } catch {
            setAnalyzeError(t('error_network'));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handlePresetSelect = (preset: TonePreset) => {
        setSelectedPreset(preset);
        syncTone(toneSource, preset, selectedDocId);

        // Auto-reset incompatible modules when switching TO formal
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
        syncTone(toneSource, selectedPreset, selectedDocId, { lang });
    };

    const handleContactPersonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setContactPerson(val);
        syncTone(toneSource, selectedPreset, selectedDocId, { contact: val });
    };

    const handleFormalityChange = (f: 'sie' | 'du') => {
        setFormality(f);
        syncTone(toneSource, selectedPreset, selectedDocId, { form: f });
    };

    // Find the currently selected doc name for display
    const selectedDocName = selectedDocId
        ? availableDocs.find(d => d.id === selectedDocId)?.fileName || 'Anschreiben'
        : null;

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">{t('tone_title')}</h3>
                    {setupData.styleAnalysisSummary && (
                        <p className="text-xs text-[#73726E] mt-0.5">{setupData.styleAnalysisSummary}</p>
                    )}
                </div>

                {/* Language Toggle — left-aligned for visibility */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#73726E]">{t('language_label')}</span>
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
                                {lang === 'de' ? 'DE' : 'EN'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── Tone Source Radio Circles ─────────────────────────────── */}
            <div className="flex items-center gap-6">
                {/* Eigener Stil */}
                <button
                    onClick={() => hasUploadedDocs ? handleToneSourceChange('custom-style') : setShowCoverLetterRequired(true)}
                    className={`flex items-center gap-2 cursor-pointer transition-all ${!hasUploadedDocs ? 'opacity-50 hover:opacity-70' : ''
                        }`}
                    title={!hasUploadedDocs ? t('doc_upload_hint') : undefined}
                >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${toneSource === 'custom-style' && hasUploadedDocs
                            ? 'border-[#002e7a] bg-[#002e7a]'
                            : 'border-[#D1D5DB]'
                        }`}>
                        {toneSource === 'custom-style' && hasUploadedDocs && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.15 }}
                                className="w-2 h-2 rounded-full bg-white"
                            />
                        )}
                    </div>
                    <span className={`text-xs font-semibold ${toneSource === 'custom-style' && hasUploadedDocs ? 'text-[#002e7a]' : 'text-[#73726E]'
                        }`}>
                        {t('source_custom')}
                    </span>
                </button>

                {/* Ton Wählen (Preset) */}
                <button
                    onClick={() => handleToneSourceChange('preset')}
                    className="flex items-center gap-2 cursor-pointer"
                >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${toneSource === 'preset'
                            ? 'border-[#002e7a] bg-[#002e7a]'
                            : 'border-[#D1D5DB]'
                        }`}>
                        {toneSource === 'preset' && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.15 }}
                                className="w-2 h-2 rounded-full bg-white"
                            />
                        )}
                    </div>
                    <span className={`text-xs font-semibold ${toneSource === 'preset' ? 'text-[#002e7a]' : 'text-[#73726E]'
                        }`}>
                        {t('source_preset')}
                    </span>
                </button>
            </div>

            {/* ─── Custom Style: Selected Doc Info ───────────────────────── */}
            <AnimatePresence mode="wait">
                {toneSource === 'custom-style' && hasUploadedDocs && (
                    <motion.div
                        key="custom-style-info"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-[#EEF3FF] border border-[#002e7a]/20 rounded-lg p-3 cursor-pointer hover:bg-[#E5EDFF] transition-colors"
                            onClick={() => setShowDocPicker(true)}
                        >
                            <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-[#002e7a] shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[#37352F]">
                                        {t('doc_template_label', { name: selectedDocName || t('doc_template_choose') })}
                                    </p>
                                    <p className="text-[10px] text-[#73726E] mt-0.5">
                                        {t('doc_desc')}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowDocPicker(true); }}
                                    className="text-[10px] text-[#002e7a] hover:underline shrink-0 font-medium"
                                >
                                    {selectedDocName ? t('doc_change') : t('doc_choose')}
                                </button>
                            </div>

                            {/* Warning if selected doc has no style analysis */}
                            {selectedDocId && !analyzedDocIds.has(selectedDocId) && (
                                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-amber-600">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    {t('doc_not_analyzed')}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ─── Preset Cards ───────────────────────────────────────── */}
                {toneSource === 'preset' && (
                    <motion.div
                        key="preset-cards"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
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
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Document Picker Modal ──────────────────────────────── */}
            <AnimatePresence>
                {showDocPicker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                        onClick={() => setShowDocPicker(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h4 className="text-sm font-semibold text-[#37352F] mb-3">
                                {t('doc_modal_title')}
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {availableDocs.map((doc) => (
                                    <button
                                        key={doc.id}
                                        onClick={() => { setPendingDocId(doc.id); setAnalyzeError(null); }}
                                        className={[
                                            'w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center gap-2',
                                            pendingDocId === doc.id
                                                ? 'border-2 border-[#002e7a] bg-[#f0f4ff]'
                                                : 'border border-[#E7E7E5] bg-white hover:shadow-sm',
                                        ].join(' ')}
                                    >
                                        <FileText className="w-4 h-4 text-[#73726E] shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-[#37352F] truncate">{doc.fileName}</p>
                                            <p className="text-[10px] text-[#73726E]">{formatDate(doc.createdAt, locale)}</p>
                                        </div>
                                        {analyzedDocIds.has(doc.id) && (
                                            <span className="text-[9px] text-green-600 font-medium shrink-0">{t('doc_analyzed')}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {analyzeError && (
                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    {analyzeError}
                                </div>
                            )}
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={() => { setShowDocPicker(false); setPendingDocId(undefined); setAnalyzeError(null); }}
                                    className="flex-1 text-xs text-[#73726E] hover:text-[#37352F] py-2"
                                >
                                    {t('doc_cancel')}
                                </button>
                                {pendingDocId && (
                                    <button
                                        onClick={handleDocConfirm}
                                        disabled={isAnalyzing}
                                        className={[
                                            'flex-1 text-xs font-semibold py-2 rounded-lg transition-all',
                                            isAnalyzing
                                                ? 'bg-[#E7E7E5] text-[#A8A29E] cursor-wait'
                                                : 'bg-[#002e7a] text-white hover:bg-[#001e5a]',
                                        ].join(' ')}
                                    >
                                        {isAnalyzing ? t('doc_analyzing') : t('doc_confirm')}
                                    </button>
                                )}
                                {analyzeError && pendingDocId && (
                                    <button
                                        onClick={() => handleDocSelect(pendingDocId)}
                                        className="flex-1 text-xs text-amber-600 hover:text-amber-700 py-2 font-medium"
                                    >
                                        {t('doc_select_anyway')}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Contact Person Input */}
            <div className="pt-2">
                <label className="block text-xs font-semibold text-[#37352F] mb-1">
                    {t('contact_label')} <span className="text-[#A8A29E] font-normal">{t('contact_optional')}</span>
                </label>
                <input
                    type="text"
                    value={contactPerson}
                    onChange={handleContactPersonChange}
                    placeholder={t('contact_placeholder')}
                    className="w-full border border-[#E7E7E5] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#002e7a]"
                />
            </div>

            {/* Formality Toggle — DE: Sie/Du, ES: Usted/Tú, EN: always hidden */}
            {language !== 'en' && (
                <div className="pt-2">
                    <label className="block text-xs font-semibold text-[#37352F] mb-1.5">
                        {t('formality_label')}
                    </label>
                    <div className="flex items-center gap-0.5 bg-[#E7E7E5] rounded-md p-0.5 w-fit">
                        {([{ value: 'sie' as const, label: t('formality_sie') }, { value: 'du' as const, label: t('formality_du') }]).map((opt) => (
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



            {/* First 90 Days Hypothesis Toggle */}
            <div className={`border border-[#E7E7E5] rounded-lg p-3 bg-white ${isFormal ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-[#37352F]">{t('first90_title')}</p>
                            <p className="text-[10px] text-[#73726E] mt-0.5 leading-relaxed">
                                {isFormal
                                    ? t('first90_formal_desc')
                                    : t('first90_desc')}
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
                            <p className="text-xs font-semibold text-[#37352F]">{t('vul_title')}</p>
                            <p className="text-[10px] text-[#73726E] mt-0.5 leading-relaxed">
                                {isFormal
                                    ? t('vul_formal_desc')
                                    : t('vul_desc')}
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
                <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                    <ChevronLeft className="w-3.5 h-3.5" /> {t('btn_back')}
                </button>
                <button
                    type="button"
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
                    {t('btn_generate')}
                </button>
            </div>

            <DocumentsRequiredDialog
                open={showCoverLetterRequired}
                onClose={() => setShowCoverLetterRequired(false)}
                type="cover_letter"
            />
        </div>
    );
}
