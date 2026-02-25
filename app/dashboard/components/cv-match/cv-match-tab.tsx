"use client";

/**
 * CVMatchTab — Module 3 redesign.
 * - Circular SVG match score indicator
 * - Truncated score breakdown bullets with bold key terms
 * - Anforderungs-Check with Lucide badge icons + progress bar
 * - Zero emojis — Lucide icons only
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

// --- Circular Score Indicator ---
const RING_SIZE = 72;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE * 2) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score }: { score: number }) {
    const offset = RING_CIRCUMFERENCE * (1 - score / 100);
    const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';

    return (
        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
                <circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                    fill="none" stroke="#e2e8f0" strokeWidth={RING_STROKE}
                />
                <motion.circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                    fill="none" stroke={color} strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold" style={{ color }}>{score}%</span>
            </div>
        </div>
    );
}

// --- Status Badge (replaces emojis) ---
function StatusBadge({ status }: { status: 'met' | 'partial' | 'missing' }) {
    const config = {
        met: { icon: CheckCircle2, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100' },
        partial: { icon: Zap, bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-100' },
        missing: { icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
    }[status];
    const Icon = config.icon;
    return (
        <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5", config.bg, config.text, config.border, "border")}>
            <Icon size={12} />
        </span>
    );
}

// --- Collapsible bullet list for reasons (max 2 visible) ---
function ReasonsList({ reasons }: { reasons: string[] }) {
    const [expanded, setExpanded] = useState(false);
    if (reasons.length === 0) return null;
    const visible = expanded ? reasons : reasons.slice(0, 2);
    const rest = reasons.length - 2;

    /** Bold the KEY TERM at start of each bullet */
    const boldStart = (text: string): React.ReactNode => {
        const match = text.match(/^([^:,\-–]+)[:\-–,]\s*(.*)/);
        if (match) return <><strong className="font-semibold text-[#37352F]">{match[1]}:</strong> {match[2]}</>;
        return text;
    };

    return (
        <ul className="pl-[140px] pr-8 space-y-0.5 mt-0.5">
            {visible.map((r, idx) => (
                <li key={idx} className="text-xs text-slate-500 list-disc ml-4 line-clamp-2">{boldStart(r)}</li>
            ))}
            {rest > 0 && !expanded && (
                <button
                    onClick={() => setExpanded(true)}
                    className="text-[10px] text-blue-600 hover:underline ml-4 mt-0.5 flex items-center gap-0.5"
                >
                    <ChevronDown className="w-3 h-3" /> ... mehr anzeigen
                </button>
            )}
        </ul>
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

        return (
            <div className="p-6 bg-[#FAFAF9] rounded-b-xl border-t border-slate-200 space-y-4">

                {/* ── Match Score + Score Breakdown (side-by-side) ── */}
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Match Score Card */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-[#37352F] mb-1">Match Score</h3>
                        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{matchData.overallRecommendation}</p>
                        <div className="flex justify-center">
                            <ScoreRing score={matchData.overallScore} />
                        </div>
                    </div>

                    {/* Score Breakdown */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Score-Breakdown</h4>
                        <div className="space-y-2">
                            {[
                                { label: 'Technische Skills', value: matchData.scoreBreakdown.technicalSkills },
                                { label: 'Soft Skills', value: matchData.scoreBreakdown.softSkills },
                                { label: 'Erfahrungslevel', value: matchData.scoreBreakdown.experienceLevel },
                                { label: 'Domain-Wissen', value: matchData.scoreBreakdown.domainKnowledge },
                            ].map((item, i) => {
                                const score = typeof item.value === 'number' ? item.value : item.value?.score || 0;
                                const reasons = typeof item.value === 'number' ? [] : item.value?.reasons || [];

                                return (
                                    <div key={i} className="mb-2 last:mb-0">
                                        <div className="flex items-center text-sm mb-1">
                                            <div className="w-32 text-slate-500 font-medium text-xs">
                                                <strong>{item.label}</strong>
                                            </div>
                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden mx-2">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: score + '%' }}
                                                    transition={{ duration: 1, delay: i * 0.1 }}
                                                    className="h-full bg-[#002e7a]"
                                                />
                                            </div>
                                            <div className="w-8 text-right font-medium text-xs text-[#37352F]">{score}%</div>
                                        </div>
                                        <ReasonsList reasons={reasons} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Anforderungs-Check ── */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-200 bg-[#FAFAF9] flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-[#37352F]">Anforderungs-Check</h3>
                        {/* Progress bar replaces "3/6 erfuellt" count */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{metCount}/{totalCount}</span>
                            <div className="w-20 h-1 bg-slate-100 rounded overflow-hidden">
                                <div className="h-1 bg-green-500 rounded" style={{ width: `${metPercent}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-[1.5fr_1.5fr_2fr] bg-slate-50 px-4 py-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                        <span>Anforderung</span>
                        <span>CV -- Ist-Zustand</span>
                        <span>Veraenderungsvorschlag</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {matchData.requirementRows.map((row, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="grid grid-cols-[1.5fr_1.5fr_2fr] text-sm text-[#37352F] group"
                            >
                                {/* Anforderung */}
                                <div className="p-3 border-r border-slate-100 flex items-start gap-2 bg-white group-hover:bg-slate-50 transition-colors">
                                    <StatusBadge status={row.status} />
                                    <span className="leading-snug text-xs">{row.requirement}</span>
                                </div>

                                {/* Ist-Zustand — line-clamp-2, bold first noun */}
                                <div className="p-3 border-r border-slate-100 text-xs text-slate-500 bg-white group-hover:bg-slate-50 transition-colors line-clamp-2 leading-snug">
                                    {row.currentState}
                                </div>

                                {/* Vorschlag — line-clamp-2 */}
                                <div className="p-3 text-xs text-[#37352F] bg-blue-50/30 group-hover:bg-blue-50/50 transition-colors line-clamp-2 leading-snug">
                                    {row.suggestion || '--'}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* ── Staerken, Luecken & Potenziale ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold text-[#37352F] mb-2 flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-green-500" /> Staerken
                        </h4>
                        <ul className="space-y-1.5 text-xs text-slate-500">
                            {matchData.strengths.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5 line-clamp-2">
                                    <span className="text-green-500 mt-0.5 shrink-0">--</span>
                                    <span className="leading-tight">{s}</span>
                                </li>
                            ))}
                            {matchData.strengths.length === 0 && <li>Keine offensichtlichen Staerken identifiziert.</li>}
                        </ul>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold text-[#37352F] mb-2 flex items-center gap-1.5">
                            <AlertCircle size={14} className="text-red-400" /> Luecken
                        </h4>
                        <ul className="space-y-1.5 text-xs text-slate-500">
                            {matchData.gaps.map((g, i) => (
                                <li key={i} className="flex items-start gap-1.5 line-clamp-2">
                                    <span className="text-red-400 mt-0.5 shrink-0">--</span>
                                    <span className="leading-tight">{g}</span>
                                </li>
                            ))}
                            {matchData.gaps.length === 0 && <li>Keine relevanten Luecken identifiziert.</li>}
                        </ul>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                        <h4 className="text-xs font-semibold text-[#37352F] mb-2 flex items-center gap-1.5">
                            <Zap size={14} className="text-amber-400" /> Versteckte Potenziale
                        </h4>
                        <ul className="space-y-1.5 text-xs text-slate-500">
                            {matchData.potentialHighlights.map((p, i) => (
                                <li key={i} className="flex items-start gap-1.5 line-clamp-2">
                                    <span className="text-amber-400 mt-0.5 shrink-0">--</span>
                                    <span className="leading-tight">{p}</span>
                                </li>
                            ))}
                            {matchData.potentialHighlights.length === 0 && <li>Keine Potenziale identifiziert.</li>}
                        </ul>
                    </div>
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
