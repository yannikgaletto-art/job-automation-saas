'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HookCard } from '../cards/HookCard';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse, SelectedHook, SelectedQuote } from '@/types/cover-letter-setup';
import { Sparkles, ChevronRight, ChevronDown, Search, SkipForward, RefreshCw, Quote, ExternalLink } from 'lucide-react';

// ─── State Machine ─────────────────────────────────────────────────
type Phase = 'idle' | 'analyzing' | 'results' | 'quotePrompt' | 'quoteSearching' | 'quoteResults';

interface Props {
    jobId: string;
    companyName: string;
    setupData: SetupDataResponse;
    onNext: () => void;
    onReloadData?: () => Promise<void>;
}

export function StepHookSelection({ jobId, companyName, setupData, onNext, onReloadData }: Props) {
    const { selectedHook, selectedQuote, fetchedQuotes, setHook, setQuote, setFetchedQuotes, setStep } = useCoverLetterSetupStore();
    const [manualText, setManualText] = useState('');
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [openAccordion, setOpenAccordion] = useState<string | null>(null);

    // ─── State Machine: resume at correct phase ────────────────────
    const getInitialPhase = (): Phase => {
        // If user already selected a hook (returning from Step 2), show results
        if (selectedHook) {
            if (fetchedQuotes.length > 0) return 'quoteResults';
            return 'results';
        }
        // If data already loaded, skip to results
        if (setupData.hasPerplexityData) return 'results';
        return 'idle';
    };

    const [phase, setPhase] = useState<Phase>(getInitialPhase);
    const [analysisStep, setAnalysisStep] = useState(0);

    // ─── Hook selection (no auto-advance) ──────────────────────────
    const handleSelect = (hook: SelectedHook) => {
        if (hook.type === 'manual') {
            setHook({ ...hook, content: manualText });
        } else {
            setHook(hook);
        }
    };

    const handleManualChange = (text: string) => {
        setManualText(text);
        const manualHook = setupData.hooks.find((h) => h.type === 'manual');
        if (manualHook && selectedHook?.type === 'manual') {
            setHook({ ...manualHook, content: text });
        }
    };

    // ─── Phase A: Company Analysis ─────────────────────────────────
    const handleAnalyze = async () => {
        setPhase('analyzing');
        setAnalysisStep(1);
        try {
            const res = await fetch('/api/jobs/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, companyName, website: setupData.companyWebsite ?? undefined })
            });
            if (!res.ok) throw new Error('Enrichment failed');

            // Real API done — now reload data
            setAnalysisStep(4);
            if (onReloadData) {
                await onReloadData();
            }
            setPhase('results');
        } catch (err) {
            console.error('❌ [StepHook] Analysis failed:', err);
            setPhase('idle');
            alert('Analyse fehlgeschlagen. Bitte Perplexity API Key prüfen.');
        }
    };

    // Update analysis step based on elapsed time (real progress, not fake)
    useEffect(() => {
        if (phase !== 'analyzing') return;
        const t1 = setTimeout(() => setAnalysisStep(2), 3000);
        const t2 = setTimeout(() => setAnalysisStep(3), 7000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [phase]);

    // ─── Phase B: Quote Search ─────────────────────────────────────
    const handleQuoteSearch = async () => {
        setPhase('quoteSearching');
        setQuoteError(null);
        try {
            // Extract company values from the hooks we have
            const companyValues = setupData.hooks
                .filter(h => h.type === 'value' || h.type === 'vision')
                .map(h => h.content)
                .slice(0, 3);

            const res = await fetch('/api/cover-letter/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, companyName, companyValues })
            });
            if (!res.ok) throw new Error('Quote search failed');

            const data = await res.json();
            setFetchedQuotes(data.quotes || []);
            setPhase('quoteResults');
        } catch (err) {
            console.error('❌ [StepHook] Quote search failed:', err);
            setQuoteError('Zitate konnten nicht geladen werden.');
            setPhase('quotePrompt');
        }
    };

    const handleProceedToStep2 = () => {
        setStep(2);
        onNext();
    };

    const canProceed = !!selectedHook && (selectedHook.type !== 'manual' || selectedHook.content.trim().length > 10);

    // ─── Phase A: IDLE ─────────────────────────────────────────────
    if (phase === 'idle') {
        return (
            <div className="px-1 py-8 flex flex-col items-center justify-center text-center">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4 border border-[#e7e7e5]">
                    <Sparkles className="w-8 h-8 text-[#002e7a]" />
                </div>
                <h3 className="text-xl font-semibold text-[#37352F] mb-2">
                    Unternehmensanalyse für <span className="text-[#002e7a]">{companyName}</span>
                </h3>
                <p className="text-[#73726E] text-sm max-w-md mb-2 leading-relaxed">
                    Um deinen Cover Letter so individuell wie möglich zu machen, analysieren wir Vision, Meilensteine, aktuelle Projekte, Seed Funding und Wachstum von {companyName}.
                </p>
                <p className="text-[#A8A29E] text-xs mb-6">
                    Klicke auf &quot;Analysieren&quot; um zu starten
                </p>
                <button
                    onClick={handleAnalyze}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#002e7a] text-white text-sm font-semibold rounded-lg hover:bg-[#001e5a] transition-colors shadow-sm"
                >
                    <Sparkles className="w-4 h-4" />
                    {companyName} analysieren
                </button>
            </div>
        );
    }

    // ─── Phase A: ANALYZING ────────────────────────────────────────
    if (phase === 'analyzing') {
        const steps = [
            'Unternehmenswebsite wird gelesen…',
            'Vision & Projekte werden analysiert…',
            'Aktuelle News & Funding werden geprüft…',
            'Ergebnisse werden aufbereitet…',
        ];
        const progress = analysisStep === 1 ? '20%' : analysisStep === 2 ? '50%' : analysisStep === 3 ? '80%' : '95%';

        return (
            <div className="px-1 py-12 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 border-3 border-[#002e7a]/20 border-t-[#002e7a] rounded-full animate-spin mb-6" />
                <h3 className="text-lg font-medium text-[#37352F] mb-4">
                    <AnimatePresence mode="popLayout">
                        <motion.span
                            key={analysisStep}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                            className="inline-block"
                        >
                            {steps[analysisStep - 1] || steps[0]}
                        </motion.span>
                    </AnimatePresence>
                </h3>
                <div className="w-64 h-1.5 bg-[#e7e7e5] rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[#002e7a]"
                        initial={{ width: '0%' }}
                        animate={{ width: progress }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            </div>
        );
    }

    // ─── Phase A: RESULTS + Phase B ────────────────────────────────
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        Ergebnisse für <span className="text-[#002e7a]">{companyName}</span>
                    </h3>
                    <p className="text-xs text-[#73726E] mt-1 max-w-xl leading-relaxed">
                        Damit wir aus der Masse herausstechen, empfehlen wir eine personalisierte Einleitung. Dazu analysierten wir die derzeitigen News des Unternehmens. Wähle eine aus, die du spannend findest.
                    </p>
                </div>
                <button
                    onClick={handleAnalyze}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors border border-[#E7E7E5] text-[#73726E] hover:bg-gray-50 shrink-0"
                    title="Analyse wiederholen"
                >
                    <RefreshCw className="w-3 h-3" /> Aktualisieren
                </button>
            </div>

            {/* Hook Cards — accordion per category */}
            {(() => {
                const filteredHooks = setupData.hooks.filter(h => h.type !== 'quote');
                const groups: { label: string; icon: string; types: string[] }[] = [
                    { label: 'News', icon: '📰', types: ['news'] },
                    { label: 'Werte', icon: '✦', types: ['value'] },
                    { label: 'Vision', icon: '🎯', types: ['vision'] },
                    { label: 'Projekte', icon: '🚀', types: ['project'] },
                    { label: 'Wachstum & Funding', icon: '📈', types: ['funding'] },
                    { label: 'LinkedIn', icon: '🔗', types: ['linkedin'] },
                    { label: 'Eigener Text', icon: '✏️', types: ['manual'] },
                ];

                return groups.map(group => {
                    const groupHooks = filteredHooks.filter(h => group.types.includes(h.type));
                    if (groupHooks.length === 0) return null;

                    const hasSelection = groupHooks.some(h => selectedHook?.id === h.id);
                    const isOpen = openAccordion === group.label || hasSelection;
                    const bestScore = Math.max(...groupHooks.map(h => Math.round((h.relevanceScore || 0) * 100)));

                    return (
                        <div key={group.label} className="border border-[#E7E7E5] rounded-lg overflow-hidden">
                            {/* Accordion Header */}
                            <button
                                type="button"
                                onClick={() => setOpenAccordion(isOpen && !hasSelection ? null : group.label)}
                                className={[
                                    'w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors',
                                    isOpen ? 'bg-[#f7f7f5]' : 'bg-white hover:bg-[#fafaf9]',
                                ].join(' ')}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">{group.icon}</span>
                                    <span className="text-xs font-semibold text-[#37352F]">{group.label}</span>
                                    <span className="text-[10px] text-[#A8A29E] font-medium">
                                        ({groupHooks.length})
                                    </span>
                                    {hasSelection && (
                                        <span className="text-[10px] bg-[#002e7a] text-white px-1.5 py-0.5 rounded-full font-medium">
                                            Gewaehlt
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {bestScore > 0 && (
                                        <span className="text-[10px] text-[#73726E] font-medium">
                                            bis {bestScore}% Match
                                        </span>
                                    )}
                                    <ChevronDown className={[
                                        'w-3.5 h-3.5 text-[#A8A29E] transition-transform',
                                        isOpen ? 'rotate-180' : '',
                                    ].join(' ')} />
                                </div>
                            </button>

                            {/* Accordion Body */}
                            <AnimatePresence initial={false}>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[#E7E7E5]">
                                            {groupHooks.map((hook) => (
                                                <HookCard
                                                    key={hook.id}
                                                    hook={hook}
                                                    isSelected={selectedHook?.id === hook.id}
                                                    onSelect={() => handleSelect(hook)}
                                                />
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                });
            })()}

            {/* Manual text input */}
            {selectedHook?.type === 'manual' && (
                <textarea
                    value={manualText}
                    onChange={(e) => handleManualChange(e.target.value)}
                    placeholder="Beschreibe dein persönliches Interesse an der Stelle oder einem spezifischen Aspekt des Unternehmens..."
                    rows={3}
                    className="w-full text-xs text-[#37352F] border border-[#002e7a] rounded-lg p-3 resize-none outline-none focus:ring-1 focus:ring-[#002e7a] placeholder-[#A8A29E]"
                />
            )}

            {/* ─── Phase B: Quote Selection ──────────────────────── */}
            {canProceed && phase === 'results' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-t border-[#E7E7E5] pt-4 mt-4 space-y-3"
                >
                    <div className="bg-[#EEF3FF] border-l-4 border-[#002e7a] rounded-md p-4">
                        <div className="flex gap-2">
                            <Quote className="w-4 h-4 text-[#002e7a] shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-xs font-semibold text-[#002e7a]">Passendes Zitat</h4>
                                <p className="text-xs text-[#37352F] leading-relaxed mt-1">
                                    Zudem empfehlen wir auch die Integration eines Zitats. Das kommt immer gut an :)
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleQuoteSearch}
                            className="flex items-center gap-2 px-4 py-2 bg-[#002e7a] text-white text-xs font-semibold rounded-lg hover:bg-[#001e5a] transition-colors"
                        >
                            <Search className="w-3.5 h-3.5" />
                            Zitate suchen
                        </button>
                        <button
                            onClick={handleProceedToStep2}
                            className="flex items-center gap-2 px-4 py-2 text-[#73726E] text-xs font-medium rounded-lg border border-[#E7E7E5] hover:bg-gray-50 transition-colors"
                        >
                            <SkipForward className="w-3.5 h-3.5" />
                            Überspringen
                        </button>
                    </div>
                    {quoteError && (
                        <p className="text-xs text-red-500">{quoteError}</p>
                    )}
                </motion.div>
            )}

            {/* Quote Searching */}
            {phase === 'quoteSearching' && (
                <div className="border-t border-[#E7E7E5] pt-6 mt-4 flex flex-col items-center text-center">
                    <div className="w-8 h-8 border-2 border-[#002e7a]/20 border-t-[#002e7a] rounded-full animate-spin mb-4" />
                    <p className="text-sm text-[#37352F] font-medium">Passende Zitate werden gesucht…</p>
                    <p className="text-xs text-[#73726E] mt-1">Perplexity analysiert relevante Quellen</p>
                </div>
            )}

            {/* Quote Results */}
            {phase === 'quoteResults' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-t border-[#E7E7E5] pt-4 mt-4 space-y-3"
                >
                    <div className="flex justify-between items-center">
                        <h4 className="text-xs font-semibold text-[#37352F]">
                            💬 Passende Zitate ({fetchedQuotes.length})
                        </h4>
                        <button
                            onClick={handleQuoteSearch}
                            className="text-[10px] text-[#73726E] hover:text-[#002e7a] flex items-center gap-1"
                        >
                            <RefreshCw className="w-3 h-3" /> 3 neue Zitate
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {fetchedQuotes.map((q, i) => (
                            <motion.button
                                key={i}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.08 }}
                                onClick={() => setQuote(selectedQuote?.quote === q.quote ? null : q)}
                                className={[
                                    'text-left w-full p-3 rounded-lg border transition-all',
                                    selectedQuote?.quote === q.quote
                                        ? 'border-2 border-[#002e7a] bg-[#f0f4ff] shadow-sm'
                                        : 'border-[#E7E7E5] bg-white hover:shadow-sm hover:border-[#d6d6d6]'
                                ].join(' ')}
                            >
                                <p className="text-xs text-[#37352F] italic leading-relaxed">
                                    &ldquo;{q.quote}&rdquo;
                                </p>
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[10px] font-medium text-[#002e7a]">
                                        — {q.author}
                                    </span>
                                    {q.source && (
                                        <span className="text-[10px] text-[#A8A29E] flex items-center gap-0.5">
                                            <ExternalLink className="w-2.5 h-2.5" /> {q.source}
                                        </span>
                                    )}
                                </div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Proceed */}
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => { setQuote(null); handleProceedToStep2(); }}
                            className="text-xs text-[#73726E] px-3 py-1.5 hover:underline"
                        >
                            Ohne Zitat fortfahren
                        </button>
                        <button
                            onClick={handleProceedToStep2}
                            disabled={!canProceed}
                            className={[
                                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                                canProceed
                                    ? 'bg-[#002e7a] text-white hover:bg-[#001e5a]'
                                    : 'bg-[#E7E7E5] text-[#A8A29E] cursor-not-allowed',
                            ].join(' ')}
                        >
                            Weiter <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Simple Weiter button when no quote section shown yet */}
            {phase === 'results' && !canProceed && (
                <div className="flex justify-end pt-2">
                    <button
                        disabled
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#E7E7E5] text-[#A8A29E] cursor-not-allowed"
                    >
                        Weiter <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
