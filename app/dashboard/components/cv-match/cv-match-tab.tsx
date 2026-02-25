"use client";

/**
 * CVMatchTab — Iteration Redesign.
 * - Match Score: Progress bar instead of circle, with top 3 bullets strictly under it.
 * - Score Breakdown: Expandable disclosure instead of truncation.
 * - Anforderungs-Check: 2fr_3fr_4fr columns with clear headers and full badge status.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CVMatchResult } from '@/lib/services/cv-match-analyzer';
import { Button } from '@/components/motion/button';
import {
    Loader2, CheckCircle2, AlertCircle, Sparkles, Zap, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CVMatchTabProps {
    jobId: string;
    cachedMatch?: any;
    onMatchStart?: () => void;
    onMatchComplete?: (result: any) => void;
    onNextStep?: () => void;
}

// --- Status Badge ---
function StatusBadge({ status }: { status: 'met' | 'partial' | 'missing' }) {
    const config = {
        met: { icon: CheckCircle2, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100', label: 'Erfüllt' },
        partial: { icon: Zap, bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-100', label: 'Teilweise' },
        missing: { icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', label: 'Fehlt' },
    }[status];
    const Icon = config.icon;
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium border", config.bg, config.text, config.border)}>
            <Icon size={12} />
            {config.label}
        </span>
    );
}

// --- Expandable bullet list for reasons ---
function ReasonsList({ reasons }: { reasons: string[] }) {
    const [expanded, setExpanded] = useState(false);
    if (reasons.length === 0) return null;

    /** Bold the KEY TERM at start of each bullet */
    const boldStart = (text: string): React.ReactNode => {
        const match = text.match(/^([^:,\-–]+)[:\-–,]\s*(.*)/);
        if (match) return <><strong className="font-semibold text-[#37352F]">{match[1]}:</strong> {match[2]}</>;
        return text;
    };

    return (
        <div className="pl-[140px] pr-8 mt-0.5">
            <ul className="space-y-0.5">
                <li className="text-xs text-slate-500 list-disc ml-4 leading-snug">{boldStart(reasons[0])}</li>
            </ul>

            <AnimatePresence>
                {expanded && reasons.length > 1 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <ul className="space-y-0.5 mt-0.5">
                            {reasons.slice(1).map((r, idx) => (
                                <li key={idx} className="text-xs text-slate-500 list-disc ml-4 leading-snug">{boldStart(r)}</li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>

            {reasons.length > 1 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                >
                    <ChevronDown
                        size={12}
                        className={cn("transition-transform duration-200", expanded && "rotate-180")}
                    />
                    {expanded ? 'Weniger anzeigen' : 'Mehr Details'}
                </button>
            )}
        </div>
    );
}

/** Insights list for Match Score card — all items + toggle, text-xs to match Score Breakdown */
function InsightsList({ items }: { items: string[] }) {
    const [expanded, setExpanded] = useState(false);
    if (items.length === 0) return <p className="text-xs text-slate-400 italic">–</p>;
    const shown = expanded ? items : items.slice(0, 1);
    return (
        <div>
            <ul className="list-disc list-inside space-y-0.5">
                {shown.map((item, i) => (
                    <li key={i} className="text-xs text-slate-700 leading-snug">{item}</li>
                ))}
            </ul>
            {items.length > 1 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                >
                    <ChevronDown size={12} className={cn("transition-transform duration-200", expanded && "rotate-180")} />
                    {expanded ? 'Weniger anzeigen' : `+${items.length - 1} mehr`}
                </button>
            )}
        </div>
    );
}

/** Expandable table cell for Anforderungs-Check rows */
function ExpandableCell({ text, boldFn }: { text: string; boldFn: (s: string) => React.ReactNode }) {
    const [expanded, setExpanded] = useState(false);
    const SHORT_LIMIT = 80;
    const isLong = text.length > SHORT_LIMIT;
    return (
        <div>
            {expanded ? (
                <p className="text-xs text-slate-600 leading-snug">{text}</p>
            ) : (
                <p className="text-xs text-slate-600 leading-snug">{boldFn(text)}</p>
            )}
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                >
                    <ChevronDown size={12} className={cn("transition-transform duration-200", expanded && "rotate-180")} />
                    {expanded ? 'Weniger anzeigen' : 'Mehr Details'}
                </button>
            )}
        </div>
    );
}

export function CVMatchTab({ jobId, cachedMatch, onMatchStart, onMatchComplete, onNextStep }: CVMatchTabProps) {
    const [state, setState] = useState<'idle' | 'loading' | 'complete' | 'error'>('idle');
    const [matchData, setMatchData] = useState<CVMatchResult | null>(null);
    const [loadingStep, setLoadingStep] = useState(0);
    const [progressText, setProgressText] = useState("Profil wird mit Stellenausschreibung abgeglichen...");

    useEffect(() => {
        if (state === 'loading' && loadingStep === 2) {
            const messages = [
                "Profil wird mit Stellenausschreibung abgeglichen...",
                "Analysiere fachliche Anforderungen...",
                "Pruefe relevante Erfahrungen...",
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
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/cv/match/cached?jobId=${jobId}`);
                const data = await res.json();
                if (cancelled) return;
                if (data.success && data.cached && data.cached.analyzed_at) {
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
    }, [jobId]);

    const runAnalysis = async () => {
        setState('loading');
        setLoadingStep(1);
        onMatchStart?.();

        try {
            await new Promise(r => setTimeout(r, 800));
            setLoadingStep(2);

            const res = await fetch('/api/cv/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            });

            setLoadingStep(3);
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

    // ── IDLE / ERROR ────────────────────────────────────────────
    if (state === 'idle' || state === 'error') {
        return (
            <div className="px-6 py-12 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-slate-200">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4 border border-slate-200">
                    <Sparkles className="w-8 h-8 text-[#002e7a]" />
                </div>
                <h3 className="text-xl font-semibold text-[#37352F] mb-2">CV Check & Optimierung</h3>
                <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
                    Wir vergleichen deinen Lebenslauf mit den Anforderungen dieser Stelle.
                    Du erhaeltst einen detaillierten Bericht, auf dessen Basis wir einen optimierten CV generieren koennen.
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

    // ── LOADING ────────────────────────────────────────────────
    if (state === 'loading') {
        return (
            <div className="px-6 py-16 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-slate-200">
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
                <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden">
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

    // ── COMPLETE ───────────────────────────────────────────────
    if (state === 'complete' && matchData) {
        const metCount = matchData.requirementRows.filter(r => r.status === 'met').length;
        const totalCount = matchData.requirementRows.length;
        const metPercent = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 0;

        const scoreColor = matchData.overallScore >= 70 ? '#22c55e' : matchData.overallScore >= 50 ? '#f59e0b' : '#ef4444';
        const score = typeof matchData.overallScore === 'number' ? matchData.overallScore : parseInt(String(matchData.overallScore ?? 0), 10);

        // Arrays sourced directly from matchData
        /** Truncate to word boundary at ~60 chars */
        const trunc = (s: string, n = 60) =>
            s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s;

        /** Extract boldable first term (noun/verb before first , : - em-dash) */
        const boldFirst = (text: string): React.ReactNode => {
            const m = text.match(/^([^:,\-–]+)[:\-–,]\s*(.*)/);
            if (m) return <><strong className="font-semibold text-slate-900">{m[1].trim()}</strong>{' — '}{trunc(m[2])}</>;
            return trunc(text);
        };

        return (
            <div className="p-5 bg-[#FAFAF9] rounded-b-xl border-t border-slate-200 space-y-4">

                {/* ── Match Score & Score Breakdown — identical card shells, same height ── */}
                <div className="grid grid-cols-2 gap-4 items-stretch">
                    {/* Match Score Card */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                            Match Score
                        </h3>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-slate-700">Übereinstimmung</span>
                            <span className="text-sm font-bold text-slate-900">{score}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 mb-5">
                            <div
                                className="h-2 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${score}%`, backgroundColor: scoreColor }}
                            />
                        </div>
                        <div className="space-y-3 flex-1">
                            {[
                                { label: 'Stärken', items: matchData.strengths.length > 0 ? matchData.strengths : ['Keine spezifischen Stärken dokumentiert.'] },
                                { label: 'Lücken', items: matchData.gaps.length > 0 ? matchData.gaps : ['Keine kritischen Lücken identifiziert.'] },
                                { label: 'Versteckte Potenziale', items: matchData.potentialHighlights.length > 0 ? matchData.potentialHighlights : ['Keine ungenutzten Potenziale erkannt.'] },
                            ].map(({ label, items }) => (
                                <div key={label}>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                                    <InsightsList items={items} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Score Breakdown */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col overflow-y-auto max-h-[400px] custom-scrollbar">
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Score-Breakdown</h4>
                        <div className="space-y-3 flex-1">
                            {[
                                { label: 'Technische Skills', value: matchData.scoreBreakdown.technicalSkills },
                                { label: 'Soft Skills', value: matchData.scoreBreakdown.softSkills },
                                { label: 'Erfahrungslevel', value: matchData.scoreBreakdown.experienceLevel },
                                { label: 'Domain-Wissen', value: matchData.scoreBreakdown.domainKnowledge },
                            ].map((item, i) => {
                                const sc = typeof item.value === 'number' ? item.value : item.value?.score || 0;
                                const reasons = typeof item.value === 'number' ? [] : item.value?.reasons || [];
                                return (
                                    <div key={i} className="mb-2 last:mb-0">
                                        <div className="flex items-center text-sm mb-1">
                                            <div className="w-32 text-slate-500 font-medium text-xs"><strong>{item.label}</strong></div>
                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden mx-2">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: sc + '%' }}
                                                    transition={{ duration: 1, delay: i * 0.1 }}
                                                    className="h-full bg-[#002e7a]"
                                                />
                                            </div>
                                            <div className="w-8 text-right font-medium text-xs text-[#37352F]">{sc}%</div>
                                        </div>
                                        <ReasonsList reasons={reasons} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Anforderungs-Check (Fix 3b) ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Anforderungs-Check</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{metCount}/{totalCount}</span>
                            <div className="w-20 h-1 bg-slate-100 rounded overflow-hidden">
                                <div className="h-1 bg-green-500 rounded" style={{ width: `${metPercent}%` }} />
                            </div>
                        </div>
                    </div>

                    <table className="w-full table-fixed">
                        <colgroup>
                            <col className="w-[22%]" />
                            <col className="w-[36%]" />
                            <col className="w-[42%]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                                <th className="px-4 py-2 text-left font-semibold">Anforderung</th>
                                <th className="px-4 py-2 text-left font-semibold">Ist-Zustand</th>
                                <th className="px-4 py-2 text-left font-semibold">Empfehlung</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {matchData.requirementRows.map((row, i) => (
                                <motion.tr
                                    key={i}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className="group hover:bg-slate-50 transition-colors"
                                >
                                    {/* Anforderung */}
                                    <td className="py-3 px-4 align-top">
                                        <StatusBadge status={row.status} />
                                        <p className="text-xs text-slate-700 mt-1.5 leading-snug">{row.requirement}</p>
                                    </td>

                                    {/* Ist-Zustand — expandable teaser */}
                                    <td className="py-3 px-4 align-top border-l border-slate-100">
                                        <ExpandableCell text={row.currentState} boldFn={boldFirst} />
                                    </td>

                                    {/* Empfehlung — expandable teaser */}
                                    <td className="py-3 px-4 align-top border-l border-slate-100">
                                        <ExpandableCell text={row.suggestion || ''} boldFn={boldFirst} />
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── ATS Keywords ── */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                    <h4 className="text-xs font-semibold text-[#37352F] mb-2">
                        ATS Keywords <span className="text-[10px] text-slate-400 font-normal ml-1">(Applicant Tracking System)</span>
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {matchData.keywordsFound.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-100">
                                <CheckCircle2 size={10} /> {kw}
                            </span>
                        ))}
                        {matchData.keywordsMissing.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 border border-red-100 opacity-75">
                                <AlertCircle size={10} /> {kw}
                            </span>
                        ))}
                        {matchData.keywordsFound.length === 0 && matchData.keywordsMissing.length === 0 && (
                            <span className="text-xs text-slate-400 italic">Keine expliziten Keywords analysiert.</span>
                        )}
                    </div>
                </div>

                {/* ── Next Step ── */}
                <div className="bg-blue-50 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between border border-blue-100">
                    <div>
                        <h4 className="font-semibold text-[#002e7a] text-sm">Zur Erstellung deines Lebenslaufs</h4>
                        <p className="text-xs text-[#002e7a]/70 mt-0.5">Gehe zum naechsten Schritt, um deinen Lebenslauf basierend auf dieser Analyse zu aktualisieren.</p>
                    </div>
                    <div className="flex gap-3 mt-3 sm:mt-0">
                        <Button variant="primary" onClick={() => onNextStep?.()} className="shadow-sm text-sm">
                            Weiter zur Erstellung
                        </Button>
                    </div>
                </div>

            </div>
        );
    }

    return null;
}
