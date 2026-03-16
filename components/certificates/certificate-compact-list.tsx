'use client';

/**
 * CertificateCompactList — Schlanke Listenansicht für Certificate Recommendations
 *
 * Designed for embedding in narrow inline toggles (e.g. Coaching page).
 * Uses the same API + types as CertificateKanbanBoard, but renders
 * a vertical card list instead of the 3-column Kanban grid.
 *
 * Feature-Silo: /components/certificates/ (Contract §0.2)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Loader2, AlertCircle, Clock, Euro, ExternalLink, Award, Star, XCircle } from 'lucide-react';
import type { CertificateRecommendation, CertificateStatus } from '@/types/certificates';

interface CertificateCompactListProps {
    jobId: string;
    jobStatus: string;
    hasCompletedSession: boolean;
}

const BLUE = '#2B5EA7';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

const POLL_TIMEOUT_MS = 60_000; // 60s timeout (was 120s)

export function CertificateCompactList({ jobId, jobStatus, hasCompletedSession }: CertificateCompactListProps) {
    const [status, setStatus] = useState<CertificateStatus | 'idle' | 'loading'>('loading');
    const [recommendations, setRecommendations] = useState<CertificateRecommendation[] | null>(null);
    const [summaryText, setSummaryText] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollStartRef = useRef<number | null>(null);

    const isLocked = !hasCompletedSession;

    // ── Fetch ────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/certificates/${jobId}`);
            if (res.status === 404) { setStatus('idle'); return; }
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            setStatus(data.status);
            setRecommendations(data.recommendations);
            setSummaryText(data.summary_text);
        } catch {
            setStatus('idle');
        }
    }, [jobId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Polling (60s timeout) ────────────────────────────────────────
    useEffect(() => {
        if (status !== 'pending' && status !== 'processing') {
            pollStartRef.current = null;
            return;
        }
        if (pollStartRef.current === null) pollStartRef.current = Date.now();

        const interval = setInterval(async () => {
            const elapsed = pollStartRef.current ? Date.now() - pollStartRef.current : 0;
            if (elapsed > POLL_TIMEOUT_MS) {
                clearInterval(interval);
                pollStartRef.current = null;
                setStatus('failed');
                setSummaryText('Die Generierung hat zu lange gedauert.');
                setIsGenerating(false);
                return;
            }
            const res = await fetch(`/api/certificates/${jobId}`);
            if (!res.ok) return;
            const data = await res.json();
            setStatus(data.status);
            if (data.status === 'done' || data.status === 'failed') {
                setRecommendations(data.recommendations);
                setSummaryText(data.summary_text);
                setIsGenerating(false);
                pollStartRef.current = null;
                clearInterval(interval);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [status, jobId]);

    // ── Generate ─────────────────────────────────────────────────────
    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        try {
            const res = await fetch('/api/certificates/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Generation failed');
            }
            setStatus('pending');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fehler bei der Generierung');
            setIsGenerating(false);
        }
    };

    // ── Cancel ────────────────────────────────────────────────────────
    const handleCancel = () => {
        pollStartRef.current = null;
        setIsGenerating(false);
        setStatus('idle');
        setError(null);
    };

    // ── Loading ──────────────────────────────────────────────────────
    if (status === 'loading') {
        return (
            <div className="flex items-center gap-2 py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: MUTED }} />
                <span className="text-xs" style={{ color: MUTED }}>Lade Weiterbildungen...</span>
            </div>
        );
    }

    // ── Processing ───────────────────────────────────────────────────
    if (status === 'pending' || status === 'processing' || isGenerating) {
        return (
            <div className="py-3 space-y-2">
                <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: BLUE }} />
                    <span className="text-xs font-medium" style={{ color: TEXT }}>
                        Empfehlungen werden generiert...
                    </span>
                </div>
                <p className="text-[11px]" style={{ color: MUTED }}>
                    KI analysiert Profil und recherchiert Zertifizierungen (ca. 10–15 Sek.)
                </p>
                <button
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-md transition-colors hover:bg-red-50"
                    style={{ color: '#DC2626', border: '1px solid #FECACA' }}
                >
                    <XCircle className="w-3 h-3" />
                    Abbrechen
                </button>
            </div>
        );
    }

    // ── Failed ───────────────────────────────────────────────────────
    if (status === 'failed') {
        return (
            <div className="py-3 space-y-2">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs" style={{ color: TEXT }}>
                        {summaryText || 'Fehler bei der Generierung.'}
                    </span>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all border-2 disabled:opacity-50"
                    style={{ borderColor: BLUE, color: BLUE, background: 'transparent' }}
                >
                    Erneut versuchen
                </button>
            </div>
        );
    }

    // ── Idle (no data yet) → CTA (matches "Interview beginnen" style) ──
    if (status === 'idle' || !recommendations || recommendations.length === 0) {
        return (
            <div className="py-3">
                {error && (
                    <p className="text-xs text-red-600 mb-2">{error}</p>
                )}
                {isLocked ? (
                    <p className="text-xs italic" style={{ color: MUTED }}>
                        Schließe ein Interview ab, um Empfehlungen zu erhalten.
                    </p>
                ) : (
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border-2 disabled:opacity-50"
                        style={{
                            borderColor: BLUE,
                            color: isGenerating ? MUTED : BLUE,
                            background: 'transparent',
                        }}
                        onMouseEnter={(e) => {
                            if (!isGenerating) {
                                (e.currentTarget as HTMLButtonElement).style.background = BLUE;
                                (e.currentTarget as HTMLButtonElement).style.color = 'white';
                            }
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = BLUE;
                        }}
                    >
                        {isGenerating ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generiert...</>
                        ) : (
                            <><GraduationCap className="w-3.5 h-3.5" /> Empfehlungen laden</>
                        )}
                    </button>
                )}
            </div>
        );
    }

    // ── Done → Compact List ──────────────────────────────────────────
    return (
        <AnimatePresence>
            <div className="divide-y" style={{ borderColor: BORDER }}>
                {summaryText && (
                    <p className="text-[11px] italic leading-relaxed pb-2" style={{ color: MUTED }}>
                        {summaryText}
                    </p>
                )}
                {recommendations.map((rec, idx) => (
                    <motion.div
                        key={rec.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08, duration: 0.2 }}
                        className="py-3"
                    >
                        {/* Row 1: Title + Provider */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-snug" style={{ color: TEXT }}>
                                    {rec.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <Award className="w-3 h-3 shrink-0" style={{ color: BLUE }} />
                                    <span className="text-[10px] font-medium" style={{ color: MUTED }}>
                                        {rec.provider}
                                    </span>
                                    <span className="inline-flex items-center gap-0.5 ml-1">
                                        {Array.from({ length: 3 }).map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`w-2.5 h-2.5 ${i < rec.reputationScore ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                                            />
                                        ))}
                                    </span>
                                </div>
                            </div>
                            {rec.urlValid && (
                                <a
                                    href={rec.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-md transition-all border-2"
                                    style={{ borderColor: BLUE, color: BLUE, background: 'transparent' }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLAnchorElement).style.background = BLUE;
                                        (e.currentTarget as HTMLAnchorElement).style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                                        (e.currentTarget as HTMLAnchorElement).style.color = BLUE;
                                    }}
                                >
                                    <span className="flex items-center gap-1">
                                        <ExternalLink className="w-3 h-3" />
                                        Zum Kurs
                                    </span>
                                </a>
                            )}
                        </div>

                        {/* Row 2: Metadata */}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: MUTED }}>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {rec.durationEstimate}
                            </span>
                            <span className="flex items-center gap-1">
                                <Euro className="w-3 h-3" />
                                {rec.priceEstimate}
                            </span>
                            {rec.hasAZAV && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-50 text-green-700 border border-green-200">
                                    Förderfähig
                                </span>
                            )}
                        </div>

                        {/* Row 3: Reason */}
                        <p className="text-[11px] italic leading-relaxed mt-1.5" style={{ color: MUTED }}>
                            {rec.reasonForMatch}
                        </p>
                    </motion.div>
                ))}
            </div>
        </AnimatePresence>
    );
}
