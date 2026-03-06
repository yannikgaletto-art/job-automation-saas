'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    Loader2,
    CheckCircle,
    ChevronRight,
    Star,
    BookOpen,
    Target,
    TrendingUp,
    Bookmark,
} from 'lucide-react';
import type { FeedbackReport } from '@/types/coaching';

const BLUE = '#2B5EA7';
const BLUE_LIGHT = '#E8EFF8';
const BLUE_DARK = '#1E4A8A';
const BG = '#FAFAF9';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

export default function CoachingAnalysisPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;

    const [report, setReport] = useState<FeedbackReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [savingGoals, setSavingGoals] = useState(false);
    const [goalsSaved, setGoalsSaved] = useState(false);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadData();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/coaching/session?sessionId=${sessionId}`);
                if (res.ok) {
                    const { session } = await res.json();
                    if (session.feedback_report) {
                        if (pollRef.current) clearInterval(pollRef.current);
                        parseReport(session.feedback_report);
                    }
                }
            } catch { /* ignore */ }
        }, 3000);
    }, [sessionId]);

    function parseReport(raw: string) {
        try {
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            setReport(parsed);
        } catch {
            // Fallback: create a minimal report from raw text
            setReport({
                overallScore: 0,
                summary: raw,
                dimensions: [],
                strengths: [],
                improvements: [],
                topicSuggestions: [],
            });
        }
    }

    async function loadData() {
        try {
            const res = await fetch(`/api/coaching/session?sessionId=${sessionId}`);
            if (!res.ok) {
                router.push('/dashboard/coaching');
                return;
            }
            const { session } = await res.json();

            // If not completed, redirect to chat
            if (session.session_status === 'active') {
                router.push(`/dashboard/coaching/${sessionId}`);
                return;
            }

            // Load job info
            const jobRes = await fetch(`/api/jobs/list`);
            if (jobRes.ok) {
                const jobData = await jobRes.json();
                const job = (jobData.jobs || []).find((j: { id: string }) => j.id === session.job_id);
                if (job) {
                    setJobTitle(job.job_title || '');
                    setCompanyName(job.company_name || '');
                }
            }

            if (session.feedback_report) {
                parseReport(session.feedback_report);
            } else {
                startPolling();
            }
        } catch (err) {
            console.error('[Analysis] Load error:', err);
        } finally {
            setLoading(false);
        }
    }

    async function saveToGoals() {
        if (savingGoals || goalsSaved || !report) return;
        setSavingGoals(true);

        try {
            // Build learning topics from improvements + topicSuggestions
            const topics = [
                ...(report.improvements || []).slice(0, 3),
                ...(report.topicSuggestions || []).slice(0, 2),
            ].filter(Boolean);

            const taskTitle = `Interview-Vorbereitung: ${companyName || 'Job'}`;
            const taskDescription = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');

            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: taskTitle,
                    description: taskDescription,
                    estimated_minutes: 25,
                    category: 'learning',
                    source: 'coaching',
                }),
            });

            if (res.ok) {
                setGoalsSaved(true);
            } else {
                console.error('[Analysis] Failed to save goals');
            }
        } catch (err) {
            console.error('[Analysis] Save goals error:', err);
        } finally {
            setSavingGoals(false);
        }
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: BLUE }} />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: BLUE }} />
                    <p className="text-sm mt-3" style={{ color: MUTED }}>
                        Dein Feedback-Report wird erstellt...
                    </p>
                    <p className="text-xs mt-1" style={{ color: MUTED }}>
                        Das dauert ca. 10-15 Sekunden.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl pb-16">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => router.push('/dashboard/coaching')}
                    className="p-1 rounded transition-colors hover:bg-[#F0EFED]"
                >
                    <ArrowLeft className="h-5 w-5" style={{ color: MUTED }} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: TEXT }}>
                        Interview Analyse
                    </h1>
                    <p className="text-sm" style={{ color: MUTED }}>
                        {jobTitle} · {companyName}
                    </p>
                </div>
            </div>

            {/* ─── Overall Score ──────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-5 mb-6"
                style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}22` }}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: BLUE }}>
                            Gesamtbewertung
                        </p>
                        <p className="text-4xl font-bold mt-1" style={{ color: BLUE }}>
                            {report.overallScore}<span className="text-lg font-normal">/10</span>
                        </p>
                    </div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${BLUE}15` }}>
                        <Star className="h-8 w-8" style={{ color: BLUE }} />
                    </div>
                </div>
                <p className="text-sm mt-3" style={{ color: TEXT }}>
                    {report.summary}
                </p>
            </motion.div>

            {/* ─── Score Breakdown ────────────────────────────────────── */}
            {report.dimensions && report.dimensions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-8"
                >
                    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: MUTED }}>
                        Score-Breakdown
                    </p>
                    <div className="space-y-6">
                        {report.dimensions.map((dim, i) => (
                            <div key={i}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-base font-semibold" style={{ color: TEXT }}>{dim.name}</span>
                                    <span className="text-base font-bold" style={{ color: BLUE }}>{dim.score * 10}%</span>
                                </div>
                                <div className="w-full h-3 rounded-full mb-3" style={{ background: BLUE_LIGHT }}>
                                    <motion.div
                                        className="h-3 rounded-full"
                                        style={{ background: BLUE }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${dim.score * 10}%` }}
                                        transition={{ duration: 0.5, delay: 0.1 * i }}
                                    />
                                </div>
                                <ul className="space-y-1">
                                    {dim.feedback.split('. ').filter(Boolean).slice(0, 3).map((point, j) => {
                                        const trimmed = point.replace(/\.$/, '').trim();
                                        if (!trimmed) return null;
                                        // Bold the first phrase (up to first colon or comma)
                                        const colonIdx = trimmed.indexOf(':');
                                        const boldPart = colonIdx > 0 ? trimmed.substring(0, colonIdx + 1) : '';
                                        const restPart = colonIdx > 0 ? trimmed.substring(colonIdx + 1).trim() : trimmed;
                                        return (
                                            <li key={j} className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BLUE }} />
                                                {boldPart ? (
                                                    <span><strong>{boldPart}</strong> {restPart}</span>
                                                ) : (
                                                    <span>{restPart}</span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ─── Was gut war / Was verbessert werden kann ────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
            >
                {/* Strengths */}
                {report.strengths && report.strengths.length > 0 && (
                    <div className="rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="h-4 w-4" style={{ color: BLUE }} />
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BLUE }}>
                                Überzeugend
                            </p>
                        </div>
                        <ul className="space-y-2">
                            {report.strengths.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                    <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: BLUE }} />
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Improvements */}
                {report.improvements && report.improvements.length > 0 && (
                    <div className="rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                        <div className="flex items-center gap-2 mb-3">
                            <Target className="h-4 w-4 text-orange-500" />
                            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                                Verbesserungspotenzial
                            </p>
                        </div>
                        <ul className="space-y-2">
                            {report.improvements.map((imp, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
                                    {imp}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </motion.div>

            {/* ─── Topic Suggestions ──────────────────────────────────── */}
            {report.topicSuggestions && report.topicSuggestions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-xl p-4 mb-6"
                    style={{ border: `1px solid ${BORDER}` }}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="h-4 w-4" style={{ color: BLUE }} />
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BLUE }}>
                            Themen zum Vertiefen
                        </p>
                    </div>
                    <ul className="space-y-2">
                        {report.topicSuggestions.map((topic, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0" style={{ background: BLUE_LIGHT, color: BLUE }}>
                                    {i + 1}
                                </span>
                                {topic}
                            </li>
                        ))}
                    </ul>
                </motion.div>
            )}

            {/* ─── Save to Today's Goals ──────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-xl p-5"
                style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}22` }}
            >
                <div className="flex items-start gap-3">
                    <Bookmark className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BLUE }} />
                    <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                            Lerninhalte in Today&apos;s Goals speichern?
                        </p>
                        <p className="text-xs mt-1" style={{ color: MUTED }}>
                            Wir erstellen eine 25-Minuten Lerneinheit basierend auf den Verbesserungsvorschlägen.
                        </p>
                        <button
                            onClick={saveToGoals}
                            disabled={savingGoals || goalsSaved}
                            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                            style={{
                                background: goalsSaved ? '#4CAF50' : BLUE,
                                color: 'white',
                            }}
                        >
                            {savingGoals ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : goalsSaved ? (
                                <>
                                    <CheckCircle className="h-4 w-4" />
                                    Gespeichert
                                </>
                            ) : (
                                <>
                                    <Bookmark className="h-4 w-4" />
                                    25 Min. Lerneinheit speichern
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
