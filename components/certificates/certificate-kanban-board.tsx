'use client';

/**
 * CertificateKanbanBoard — 3-Column Kanban for certificate recommendations
 *
 * Design: Notion-like aesthetic, Framer Motion stagger
 * Columns: "Top Reputation" | "Spezialist" | "Preis-Tipp"
 *
 * Empty States:
 * - No entry ➝ "Empfehlungen generieren" CTA
 * - CV fehlt ➝ Blocking: "Lade deinen Lebenslauf hoch"
 * - CV Match fehlt ➝ Blocking: "Berechne zuerst den CV Match"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Loader2, AlertCircle, CheckCircle2, FileText, BarChart3 } from 'lucide-react';
import { CertificateCard } from './certificate-card';
import type { CertificateRecommendation, CertificateStatus } from '@/types/certificates';

interface CertificateKanbanBoardProps {
    jobId: string;
    jobStatus?: string; // raw DB status from job_queue
    initialData?: {
        status: 'idle' | 'pending' | 'processing' | 'done' | 'failed';
        recommendations: CertificateRecommendation[];
        summaryText: string;
    } | null;
    onDataLoaded?: (data: {
        status: 'idle' | 'pending' | 'processing' | 'done' | 'failed';
        recommendations: CertificateRecommendation[];
        summaryText: string;
    }) => void;
}

const COLUMN_CONFIG = [
    { key: 'reputation' as const, label: 'Top Reputation', subtitle: 'TÜV, SGS, DQS, BSI' },
    { key: 'specialist' as const, label: 'Spezialist', subtitle: 'Fachspezifische Anbieter' },
    { key: 'value' as const, label: 'Preis-Tipp', subtitle: 'Beste Kosten-Nutzen' },
] as const;

// Stagger animation
const containerVariants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.1 },
    },
};

const cardVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: 'easeOut' },
    },
};

function SkeletonCard() {
    return (
        <div className="bg-white rounded-lg border border-[#E8E5E0] p-4 space-y-3 animate-pulse">
            <div className="flex justify-between">
                <div className="h-3 bg-slate-200 rounded w-20" />
                <div className="h-3 bg-slate-200 rounded w-12" />
            </div>
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-full" />
            <div className="flex gap-3">
                <div className="h-3 bg-slate-200 rounded w-16" />
                <div className="h-3 bg-slate-200 rounded w-16" />
            </div>
            <div className="h-8 bg-slate-200 rounded w-full" />
        </div>
    );
}

export function CertificateKanbanBoard({ jobId, jobStatus, initialData, onDataLoaded }: CertificateKanbanBoardProps) {
    const [status, setStatus] = useState<CertificateStatus | 'idle' | 'loading'>('loading');
    const [recommendations, setRecommendations] = useState<CertificateRecommendation[] | null>(null);
    const [summaryText, setSummaryText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    // Persists across re-renders — survives tab switches without resetting timer
    const pollStartTimeRef = useRef<number | null>(null);

    // ── Blocking states ─────────────────────────────────────────────
    const cvMatchStatuses = ['cv_matched', 'cv_match_done', 'cv_optimized', 'cover_letter_done', 'ready_for_review', 'ready_to_apply'];
    const hasCVMatch = cvMatchStatuses.includes(jobStatus?.toLowerCase() || '');

    // ── Fetch existing certificates ─────────────────────────────────
    const fetchCertificates = useCallback(async () => {
        try {
            const res = await fetch(`/api/certificates/${jobId}`);
            if (res.status === 404) {
                setStatus('idle');
                return;
            }
            if (!res.ok) {
                throw new Error('Fetch failed');
            }
            const data = await res.json();
            setStatus(data.status);
            setRecommendations(data.recommendations);
            setSummaryText(data.summary_text);
            // Cache data in parent for tab-switch persistence
            if (data.status === 'done' && data.recommendations) {
                onDataLoaded?.({
                    status: 'done',
                    recommendations: data.recommendations,
                    summaryText: data.summary_text || '',
                });
            }
        } catch {
            setStatus('idle');
        }
    }, [jobId]);

    useEffect(() => {
        // If we have cached done data, use it immediately — no API call needed
        if (initialData?.status === 'done') {
            setStatus('done');
            setRecommendations(initialData.recommendations);
            setSummaryText(initialData.summaryText);
            return;
        }
        fetchCertificates();
    }, [fetchCertificates, initialData]);

    // ── Polling while processing (with 90s timeout) ───────────────
    useEffect(() => {
        if (status !== 'pending' && status !== 'processing') {
            pollStartTimeRef.current = null; // Reset when not polling
            return;
        }
        // Only record start time once — not on every re-render
        if (pollStartTimeRef.current === null) {
            pollStartTimeRef.current = Date.now();
        }

        const interval = setInterval(async () => {
            // Timeout after 90s — stop polling, show error
            const elapsed = pollStartTimeRef.current
                ? Date.now() - pollStartTimeRef.current
                : 0;
            if (elapsed > 120_000) {
                clearInterval(interval);
                pollStartTimeRef.current = null;
                setStatus('failed');
                setSummaryText('Die Generierung hat zu lange gedauert. Bitte versuche es erneut.');
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
                pollStartTimeRef.current = null;
                clearInterval(interval);
                // Cache done data in parent for tab-switch persistence
                if (data.status === 'done' && data.recommendations) {
                    onDataLoaded?.({
                        status: 'done',
                        recommendations: data.recommendations,
                        summaryText: data.summary_text || '',
                    });
                }
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [status, jobId]);

    // ── Generate handler ────────────────────────────────────────────
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

    // ── Blocking State: CV Match fehlt ──────────────────────────────
    if (!hasCVMatch) {
        return (
            <div className="px-6 py-10">
                <div className="text-center max-w-md mx-auto space-y-3">
                    <BarChart3 className="w-10 h-10 mx-auto text-slate-300" />
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        CV Match erforderlich
                    </h3>
                    <p className="text-xs text-[#73726E]">
                        Berechne zuerst den CV Match, um passende Zertifizierungsempfehlungen zu erhalten.
                    </p>
                </div>
            </div>
        );
    }

    // ── Loading State ───────────────────────────────────────────────
    if (status === 'loading') {
        return (
            <div className="px-6 py-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {COLUMN_CONFIG.map((col) => (
                        <div key={col.key} className="space-y-3">
                            <div className="h-4 bg-slate-200 rounded w-24 animate-pulse" />
                            <SkeletonCard />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Processing / Pending State ──────────────────────────────────
    if (status === 'pending' || status === 'processing' || isGenerating) {
        return (
            <div className="px-6 py-6">
                <div className="text-center max-w-md mx-auto space-y-4 py-6">
                    <Loader2 className="w-8 h-8 mx-auto text-[#002e7a] animate-spin" />
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        Empfehlungen werden generiert...
                    </h3>
                    <p className="text-xs text-[#73726E]">
                        KI analysiert dein Profil und recherchiert passende Zertifizierungen. Das dauert ca. 10-15 Sekunden.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {COLUMN_CONFIG.map((col) => (
                        <div key={col.key} className="space-y-3">
                            <div className="text-xs font-semibold text-[#73726E] uppercase tracking-wider">{col.label}</div>
                            <SkeletonCard />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Failed State ────────────────────────────────────────────────
    if (status === 'failed') {
        return (
            <div className="px-6 py-10">
                <div className="text-center max-w-md mx-auto space-y-3">
                    <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        Generierung fehlgeschlagen
                    </h3>
                    <p className="text-xs text-[#73726E]">
                        {summaryText || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.'}
                    </p>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="mt-2 px-4 py-2 text-xs font-medium text-white bg-[#002e7a] rounded-md hover:bg-[#002e7a]/90 transition-colors disabled:opacity-50"
                    >
                        {isGenerating ? 'Generiert...' : 'Erneut versuchen'}
                    </button>
                </div>
            </div>
        );
    }

    // ── Empty / Idle State ──────────────────────────────────────────
    if (status === 'idle' || !recommendations || recommendations.length === 0) {
        return (
            <div className="px-6 py-10">
                <div className="text-center max-w-md mx-auto space-y-3">
                    <GraduationCap className="w-10 h-10 mx-auto text-slate-300" />
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        Weiterbildung & Zertifizierung
                    </h3>
                    <p className="text-xs text-[#73726E]">
                        Auf Basis deines CV und der Stellenanforderungen ermitteln wir die 3 passendsten Zertifizierungen für dich.
                    </p>

                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 border border-red-200">
                            {error}
                        </p>
                    )}

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#002e7a] rounded-md hover:bg-[#002e7a]/90 transition-colors disabled:opacity-50"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generiert...
                            </>
                        ) : (
                            <>
                                <GraduationCap className="w-4 h-4" />
                                Empfehlungen generieren
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // ── Done State — Kanban Board ───────────────────────────────────
    const getColumnCards = (providerType: 'reputation' | 'specialist' | 'value') =>
        recommendations.filter(r => r.providerType === providerType);

    return (
        <div className="px-6 py-5 space-y-4">
            {/* Summary */}
            {summaryText && (
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#F0EEE9] rounded-lg px-4 py-3 border border-[#E8E5E0]"
                >
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-[#37352F] italic leading-relaxed">
                            {summaryText}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Kanban Grid */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {COLUMN_CONFIG.map((col) => {
                    const cards = getColumnCards(col.key);
                    return (
                        <motion.div key={col.key} variants={cardVariants} className="space-y-3">
                            {/* Column Header */}
                            <div>
                                <h4 className="text-xs font-semibold text-[#37352F] uppercase tracking-wider">
                                    {col.label}
                                </h4>
                                <p className="text-[10px] text-[#73726E] mt-0.5">{col.subtitle}</p>
                            </div>

                            {/* Cards */}
                            {cards.length > 0 ? (
                                cards.map((rec) => (
                                    <CertificateCard key={rec.id} recommendation={rec} />
                                ))
                            ) : (
                                <div className="bg-white/50 rounded-lg border border-dashed border-slate-200 p-4 text-center">
                                    <p className="text-[10px] text-slate-400">Keine Empfehlung in dieser Kategorie</p>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </motion.div>
        </div>
    );
}
