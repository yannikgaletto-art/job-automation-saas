"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CVMatchResult } from '@/lib/services/cv-match-analyzer';
import { Button } from '@/components/motion/button';
import { Loader2, Download, CheckCircle2, AlertCircle, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface CVMatchTabProps {
    jobId: string;
    cachedMatch?: any;
    onMatchStart?: () => void;
    onMatchComplete?: (result: any) => void;
    onNextStep?: () => void;
}

export function CVMatchTab({ jobId, cachedMatch, onMatchStart, onMatchComplete, onNextStep }: CVMatchTabProps) {
    const [state, setState] = useState<'idle' | 'loading' | 'complete' | 'error'>('idle');
    const [matchData, setMatchData] = useState<CVMatchResult | null>(null);
    const [loadingStep, setLoadingStep] = useState(0); // 0: Start, 1: CV lesen, 2: Analysieren, 3: Bericht erstellen
    const [progressText, setProgressText] = useState("Profil wird mit Stellenausschreibung abgeglichen...");

    useEffect(() => {
        if (state === 'loading' && loadingStep === 2) {
            const messages = [
                "Profil wird mit Stellenausschreibung abgeglichen...",
                "Analysiere fachliche Anforderungen...",
                "Prüfe relevante Erfahrungen...",
                "Berechne Match-Score...",
                "Identifiziere fehlende Keywords...",
                "Fasse Kompetenzen zusammen..."
            ];
            let index = 1;
            const interval = setInterval(() => {
                setProgressText(messages[index]);
                index = (index + 1) % messages.length;
            }, 3000);
            return () => clearInterval(interval);
        } else {
            setProgressText("Profil wird mit Stellenausschreibung abgeglichen...");
        }
    }, [state, loadingStep]);

    useEffect(() => {
        // On mount: always fetch from DB directly. This is the single source of truth.
        // We do NOT depend on cachedMatch prop to avoid re-render flashing.
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/cv/match/cached?jobId=${jobId}`);
                const data = await res.json();
                if (cancelled) return;
                if (data.success && data.cached && data.cached.analyzed_at) {
                    console.log('✅ CVMatchTab: loaded from DB', jobId);
                    setMatchData(data.cached as CVMatchResult);
                    setState('complete');
                } else {
                    setState('idle');
                }
            } catch {
                if (!cancelled) setState('idle');
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId]);

    const runAnalysis = async () => {
        setState('loading');
        setLoadingStep(1); // CV lesen
        onMatchStart?.();

        try {
            // Simulate reading CV (just for UI pacing)
            await new Promise(r => setTimeout(r, 800));
            setLoadingStep(2); // Analysieren

            const res = await fetch('/api/cv/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            });

            setLoadingStep(3); // Bericht erstellen
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Fehler bei der Analyse');
            }

            setMatchData(data.data);
            setState('complete');
            onMatchComplete?.(data.data);
            toast.success('CV Analyse erfolgreich');
        } catch (error: any) {
            console.error(error);
            setState('error');
            toast.error('Analyse fehlgeschlagen', { description: error.message });
        }
    };

    const handleDownload = async (format: 'docx' | 'pdf') => {
        toast.info(`Download für ${format.toUpperCase()} wird vorbereitet...`);
        // We will implement this API to generate and return the DOCX/PDF
        try {
            const res = await fetch('/api/cv/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, format })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Download failed');
            }

            // Create blob and force download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Optimized_CV_Pathly.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Download erfolgreich`);
        } catch (err: any) {
            toast.error('Download fehlgeschlagen', { description: err.message });
        }
    };

    if (state === 'idle' || state === 'error') {
        return (
            <div className="px-6 py-12 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-[#d6d6d6]">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4 border border-[#e7e7e5]">
                    <Sparkles className="w-8 h-8 text-[#002e7a]" />
                </div>
                <h3 className="text-xl font-semibold text-[#37352F] mb-2">CV Check & Optimierung</h3>
                <p className="text-[#73726E] text-sm max-w-md mb-6 leading-relaxed">
                    Wir vergleichen deinen Lebenslauf mit den Anforderungen dieser Stelle. Du erhältst einen detaillierten Bericht, auf dessen Basis wir einen optimierten CV generieren können.
                </p>
                {state === 'error' && (
                    <div className="mb-4 text-sm text-red-600 flex items-center gap-2 bg-red-50 px-3 py-2 rounded-md border border-red-100">
                        <AlertCircle className="w-4 h-4" />
                        <div>Ein Fehler ist aufgetreten. Bitte versuche es erneut.</div>
                    </div>
                )}
                <Button variant="primary" onClick={runAnalysis}>
                    {state === 'error' ? 'Erneut versuchen' : 'Analyse starten'}
                </Button>
            </div>
        );
    }

    if (state === 'loading') {
        return (
            <div className="px-6 py-16 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-[#d6d6d6]">
                <Loader2 className="w-10 h-10 text-[#002e7a] animate-spin mb-6" />
                <h3 className="text-lg font-medium text-[#37352F] mb-4">
                    <AnimatePresence mode="popLayout">
                        <motion.span
                            key={loadingStep === 2 ? progressText : loadingStep}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4 }}
                            className="inline-block"
                        >
                            {loadingStep === 1 && "Lebenslauf wird gelesen..."}
                            {loadingStep === 2 && progressText}
                            {loadingStep === 3 && "Match-Bericht wird erstellt..."}
                        </motion.span>
                    </AnimatePresence>
                </h3>

                <div className="w-64 h-1.5 bg-[#e7e7e5] rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[#002e7a]"
                        initial={{ width: '0%' }}
                        animate={{ width: loadingStep === 1 ? '30%' : loadingStep === 2 ? '70%' : '95%' }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            </div>
        );
    }

    if (state === 'complete' && matchData) {
        return (
            <div className="p-6 bg-[#FAFAF9] rounded-b-xl border-t border-[#d6d6d6] space-y-6">

                {/* Header & Score */}
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 bg-white border border-[#E8E8E6] rounded-lg p-5 flex items-center justify-between shadow-sm">
                        <div>
                            <h3 className="text-lg font-semibold text-[#37352F] flex items-center gap-2">
                                🎯 Match Score
                            </h3>
                            <p className="text-sm text-[#73726E] mt-1 pr-4">
                                {matchData.overallRecommendation}
                            </p>
                        </div>
                        <div className="text-center shrink-0">
                            <div className="text-4xl font-bold text-[#002e7a] tracking-tight">{matchData.overallScore}%</div>
                            <div className="text-xs text-[#9B9B9B] mt-1 uppercase font-medium">Gesamt</div>
                        </div>
                    </div>

                    <div className="flex-1 bg-white border border-[#E8E8E6] rounded-lg p-5 shadow-sm">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9B9B9B] mb-4">Score-Breakdown</h4>
                        <div className="space-y-3 relative">
                            {[
                                { label: 'Technische Skills', value: matchData.scoreBreakdown.technicalSkills },
                                { label: 'Soft Skills', value: matchData.scoreBreakdown.softSkills },
                                { label: 'Erfahrungslevel', value: matchData.scoreBreakdown.experienceLevel },
                                { label: 'Domain-Wissen', value: matchData.scoreBreakdown.domainKnowledge },
                            ].map((item, i) => {
                                const score = typeof item.value === 'number' ? item.value : item.value?.score || 0;
                                const reasons = typeof item.value === 'number' ? [] : item.value?.reasons || [];

                                return (
                                    <div key={i} className="mb-4 last:mb-0">
                                        <div className="flex items-center text-sm mb-1.5">
                                            <div className="w-32 text-[#73726E] font-medium">{item.label}</div>
                                            <div className="flex-1 h-2 bg-[#F1F1EF] rounded-full overflow-hidden mx-3">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: score + '%' }}
                                                    transition={{ duration: 1, delay: i * 0.1 }}
                                                    className="h-full bg-[#002e7a]"
                                                />
                                            </div>
                                            <div className="w-8 text-right font-medium text-[#37352F]">{score}%</div>
                                        </div>
                                        {reasons.length > 0 && (
                                            <ul className="pl-[140px] pr-8 space-y-1 mt-1">
                                                {reasons.map((r, idx) => (
                                                    <li key={idx} className="text-xs text-[#9B9B9B] list-disc ml-4 leading-relaxed">{r}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Requirements Table */}
                <div className="bg-white rounded-lg border border-[#E8E8E6] overflow-hidden shadow-sm">
                    <div className="px-5 py-4 border-b border-[#E8E8E6] bg-[#FAFAF9] flex justify-between items-center">
                        <h3 className="font-semibold text-[#37352F] flex items-center gap-2">
                            📋 Anforderungs-Check
                        </h3>
                        <div className="text-xs text-[#73726E] font-medium bg-white px-2 py-1 rounded border border-[#E8E8E6]">
                            {matchData.requirementRows.filter(r => r.status === 'met').length} / {matchData.requirementRows.length} erfüllt
                        </div>
                    </div>

                    <div className="grid grid-cols-[1.5fr_1.5fr_2fr] bg-[#F1F1EF] px-5 py-2 text-xs uppercase tracking-wide text-[#9B9B9B]">
                        <span>Anforderung</span>
                        <span>CV – Ist-Zustand</span>
                        <span>Veränderungsvorschlag</span>
                    </div>

                    <div className="divide-y divide-[#E8E8E6]">
                        {matchData.requirementRows.map((row, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="grid grid-cols-[1.5fr_1.5fr_2fr] text-sm text-[#37352F] group"
                            >
                                {/* Anforderung */}
                                <div className="p-4 border-r border-[#E8E8E6]/50 flex items-start gap-2.5 bg-white group-hover:bg-[#fafaf9] transition-colors">
                                    <span className="mt-0.5 shrink-0 text-base">
                                        {row.status === 'met' && '✅'}
                                        {row.status === 'partial' && '⚡'}
                                        {row.status === 'missing' && '❌'}
                                    </span>
                                    <span className="leading-snug">{row.requirement}</span>
                                </div>

                                {/* Ist-Zustand */}
                                <div className="p-4 border-r border-[#E8E8E6]/50 text-[#6B7280] italic bg-white group-hover:bg-[#fafaf9] transition-colors leading-snug">
                                    {row.currentState}
                                </div>

                                {/* Vorschlag */}
                                <div className="p-4 text-[#37352F] bg-blue-50/30 group-hover:bg-blue-50/50 transition-colors leading-relaxed">
                                    {row.suggestion || '—'}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Stärken, Lücken & Potenziale */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white border border-[#E8E8E6] rounded-lg p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-[#37352F] mb-3 flex items-center gap-2">
                            ✅ Stärken
                        </h4>
                        <ul className="space-y-2 text-sm text-[#6B7280]">
                            {matchData.strengths.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span className="text-[#002e7a] mt-1">•</span>
                                    <span className="leading-tight">{s}</span>
                                </li>
                            ))}
                            {matchData.strengths.length === 0 && <li>Keine offensichtlichen Stärken identifiziert.</li>}
                        </ul>
                    </div>

                    <div className="bg-white border border-[#E8E8E6] rounded-lg p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-[#37352F] mb-3 flex items-center gap-2">
                            ❌ Lücken
                        </h4>
                        <ul className="space-y-2 text-sm text-[#6B7280]">
                            {matchData.gaps.map((g, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span className="text-red-500 mt-1">•</span>
                                    <span className="leading-tight">{g}</span>
                                </li>
                            ))}
                            {matchData.gaps.length === 0 && <li>Keine relevanten Lücken identifiziert.</li>}
                        </ul>
                    </div>

                    <div className="bg-white border border-[#E8E8E6] rounded-lg p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-[#37352F] mb-3 flex items-center gap-2">
                            💡 Versteckte Potenziale
                        </h4>
                        <ul className="space-y-2 text-sm text-[#6B7280]">
                            {matchData.potentialHighlights.map((p, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-1">•</span>
                                    <span className="leading-tight">{p}</span>
                                </li>
                            ))}
                            {matchData.potentialHighlights.length === 0 && <li>Keine Potenziale identifiziert.</li>}
                        </ul>
                    </div>
                </div>

                {/* ATS Keywords */}
                <div className="bg-white border border-[#E8E8E6] rounded-lg p-5 shadow-sm">
                    <h4 className="text-sm font-semibold text-[#37352F] mb-3">🏷️ ATS Keywords <span className="text-xs text-[#9B9B9B] font-normal ml-1">(ATS = Applicant Tracking System)</span></h4>
                    <div className="flex flex-wrap gap-2">
                        {matchData.keywordsFound.map(kw => (
                            <span key={kw} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> {kw}
                            </span>
                        ))}
                        {matchData.keywordsMissing.map(kw => (
                            <span key={kw} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200 opacity-75 grayscale-[0.5]">
                                <AlertCircle className="w-3 h-3 mr-1" /> {kw}
                            </span>
                        ))}
                        {matchData.keywordsFound.length === 0 && matchData.keywordsMissing.length === 0 && (
                            <span className="text-sm text-gray-500 italic">Keine expliziten Keywords analysiert.</span>
                        )}
                    </div>
                </div>

                {/* Next Step Action */}
                <div className="bg-[#e9f0fe] rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between border border-[#c6d7fa]">
                    <div>
                        <h4 className="font-semibold text-[#002e7a]">Zur Erstellung deines Lebenslaufs</h4>
                        <p className="text-sm text-[#002e7a]/80 mt-1">Gehe zum nächsten Schritt, um deinen Lebenslauf basierend auf dieser Analyse zu aktualisieren.</p>
                    </div>
                    <div className="flex gap-3 mt-4 sm:mt-0">
                        <Button variant="primary" onClick={() => onNextStep?.()} className="shadow-sm">
                            Weiter zur Erstellung
                        </Button>
                    </div>
                </div>

            </div>
        );
    }

    return null;
}
