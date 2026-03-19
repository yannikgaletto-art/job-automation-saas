'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Star,
    TrendingUp,
    Target,
    CheckCircle,
    XCircle,
    AlertCircle,
    BookOpen,
    ExternalLink,
    Bookmark,
    Loader2,
    ChevronRight,
    ChevronDown,
    MessageSquareQuote,
} from 'lucide-react';
import type { FeedbackReport, DimensionLevel, TopicSuggestion } from '@/types/coaching';

const BLUE = '#2B5EA7';
const BLUE_LIGHT = '#E8EFF8';
const BG = '#FAFAF9';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

// Tag colors by level
const TAG_COLORS: Record<DimensionLevel, { bg: string; text: string }> = {
    green: { bg: '#D4EDDA', text: '#155724' },
    yellow: { bg: '#FFF3CD', text: '#856404' },
    red: { bg: '#F8D7DA', text: '#721C24' },
};

/** Key terms to auto-bold in text that lacks markdown bold markers.
 * Only universal/cross-language terms are listed here — DE-specific terms only apply
 * to legacy reports generated before the i18n prompt fix (2026-03-19).
 * New reports from all locales use **bold** markdown and don't need auto-bolding.
 */
const BOLD_KEYWORDS = [
    // Universal technical terms (appear in all locales)
    'STAR', 'B2B', 'Co-Founder', 'Storytelling', 'Account Management',
    'Stakeholder', 'KPI', 'Hands-on', 'Entrepreneurship', 'Cultural Fit',
    // German legacy report terms (for backward compatibility with pre-fix reports)
    'STAR-Methode', 'Kundenmanagement', 'Erwartungsmanagement',
    'Transparenz', 'Lösungsorientierung', 'Kommunikation', 'Selbstreflexion',
    'Authentizität', 'Problemlösung', 'Praxisbeispiele',
    'konkrete Beispiele', 'strukturierte', 'Verhandlungsführung',
    'Führung', 'Strategie', 'Überzeugungskraft',
    'Kundenzentrierung', 'Kundenbedürfnisse', 'Grundprinzipien',
    'Fallstudien', 'Metriken', 'Füllwörter',
    'konzeptionell', 'improvisiert', 'Nachfragen', 'Learnings',
    'souverän', 'selbstbewusst', 'vorsichtig', 'Reife', 'Lernfähigkeit',
];

/** Render markdown bold (**...**) as <strong> tags. Auto-bold key terms for old text. */
function renderBold(text: string): string {
    // If text already has ** markdown, render it
    if (text.includes('**')) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }
    // Auto-bold key terms for old reports
    let result = text;
    for (const keyword of BOLD_KEYWORDS) {
        const regex = new RegExp(`(${keyword})`, 'gi');
        result = result.replace(regex, '<strong>$1</strong>');
    }
    return result;
}

export default function CoachingAnalysisPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;
    const t = useTranslations('dashboard.coaching.analysis');

    const [report, setReport] = useState<FeedbackReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [regenerating, setRegenerating] = useState(false);
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [savedTopics, setSavedTopics] = useState<Record<number, boolean>>({});
    const [savingTopics, setSavingTopics] = useState<Record<number, boolean>>({});
    const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>({});
    const [analysisTimedOut, setAnalysisTimedOut] = useState(false);
    const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 1: true, 2: false, 3: false, 4: false });
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const pollStartTimeRef = useRef<number | null>(null);

    // Step-by-step progress for analysis
    const ANALYSIS_STEPS = useMemo(() => [
        t('analysis_step_1'),
        t('analysis_step_2'),
        t('analysis_step_3'),
        t('analysis_step_4'),
        t('analysis_step_5'),
    ], [t]);
    const [analysisStep, setAnalysisStep] = useState(0);
    const analysisStepTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Drive analysis step progress when waiting for report
    useEffect(() => {
        if (!loading && !report && !analysisTimedOut) {
            setAnalysisStep(0);
            let idx = 0;
            analysisStepTimerRef.current = setInterval(() => {
                idx = Math.min(idx + 1, ANALYSIS_STEPS.length - 1);
                setAnalysisStep(idx);
                if (idx >= ANALYSIS_STEPS.length - 1 && analysisStepTimerRef.current) clearInterval(analysisStepTimerRef.current);
            }, 3000);
            return () => { if (analysisStepTimerRef.current) clearInterval(analysisStepTimerRef.current); };
        } else if (report || analysisTimedOut) {
            if (analysisStepTimerRef.current) clearInterval(analysisStepTimerRef.current);
            setAnalysisStep(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, report, analysisTimedOut]);

    useEffect(() => {
        loadData();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollStartTimeRef.current = Date.now();
        pollRef.current = setInterval(async () => {
            const elapsed = pollStartTimeRef.current ? Date.now() - pollStartTimeRef.current : 0;
            if (elapsed > 90_000) {
                if (pollRef.current) clearInterval(pollRef.current);
                pollStartTimeRef.current = null;
                setAnalysisTimedOut(true);
                return;
            }
            try {
                const res = await fetch(`/api/coaching/session?sessionId=${sessionId}`);
                if (res.ok) {
                    const { session } = await res.json();
                    if (session.feedback_report) {
                        if (pollRef.current) clearInterval(pollRef.current);
                        pollStartTimeRef.current = null;
                        parseReport(session.feedback_report);
                    }
                }
            } catch { /* ignore */ }
        }, 3000);
    }, [sessionId]);

    function parseReport(raw: string) {
        try {
            // Robust extraction: strip markdown fences, find outermost { ... }
            let cleaned = raw
                .replace(/```(?:json|JSON)?\n?/g, '')
                .replace(/```\s*/g, '')
                .replace(/^\uFEFF/, '')
                .trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) {
                cleaned = cleaned.substring(start, end + 1);
            }
            let parsed = JSON.parse(cleaned);

            // Self-healing: detect fallback shape (populated summary, empty arrays)
            // This happens when the pipeline's JSON.parse failed and stored raw text in summary.
            if (
                parsed.summary &&
                typeof parsed.summary === 'string' &&
                parsed.summary.trimStart().startsWith('{') &&
                (!parsed.dimensions || parsed.dimensions.length === 0)
            ) {
                try {
                    const recovered = JSON.parse(parsed.summary);
                    if (recovered.overallScore !== undefined) {
                        parsed = recovered;
                    }
                } catch { /* summary wasn't JSON, use as-is */ }
            }

            // Backwards compatibility: normalize old improvements format (string[] → object[])
            if (parsed.improvements && parsed.improvements.length > 0 && typeof parsed.improvements[0] === 'string') {
                parsed.improvements = (parsed.improvements as string[]).map((s: string) => ({
                    title: s,
                    bad: '',
                    good: '',
                }));
            }

            // Backwards compatibility: fill in missing new fields
            if (!parsed.topStrength) parsed.topStrength = '';
            if (!parsed.recommendation) parsed.recommendation = '';

            // Normalize dimension levels for old reports
            if (parsed.dimensions) {
                parsed.dimensions = parsed.dimensions.map((dim: { score: number; level?: string; tag?: string; observation?: string; reason?: string; suggestion?: string; feedback?: string }) => {
                    // Correct tag thresholds: <4 red, 4-6 yellow, 7+ green
                    const level = dim.level || (dim.score >= 7 ? 'green' : dim.score >= 4 ? 'yellow' : 'red');
                    const tag = dim.tag || (dim.score >= 7 ? 'Das machst du gut' : dim.score >= 4 ? 'Da fehlt nicht viel' : 'Das vermissen wir');

                    // If old format (no observation/reason/suggestion but has feedback), split feedback into bullet points
                    let observation = dim.observation || '';
                    let reason = dim.reason || '';
                    let suggestion = dim.suggestion || '';

                    if (!observation && !reason && !suggestion && dim.feedback) {
                        // Split the old feedback paragraph into sentences and assign to fields
                        const sentences = dim.feedback.split(/\.\s+/).filter(Boolean).map(s => s.replace(/\.$/, '').trim());
                        observation = sentences[0] || '';
                        reason = sentences[1] || '';
                        suggestion = sentences[2] || '';
                    }

                    return { ...dim, level, tag, observation, reason, suggestion };
                });
            }

            setReport(parsed);
        } catch {
            setReport({
                overallScore: 0,
                topStrength: '',
                recommendation: '',
                summary: t('report_error'),
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

            if (session.session_status === 'active') {
                router.push(`/dashboard/coaching/${sessionId}`);
                return;
            }

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

    /** Normalize topic suggestion to structured format (backwards compat) */
    function normalizeTopic(raw: TopicSuggestion | string): TopicSuggestion {
        if (typeof raw === 'string') {
            // Old format: extract plain text (strip markdown bold)
            const plain = raw.replace(/\*\*/g, '');
            return {
                topic: plain,
                searchQuery: `${plain} Interview Tipps`,
                youtubeTitle: `${plain} – Tipps & Beispiele`,
            };
        }
        return raw;
    }

    async function saveTopicToGoals(index: number, topic: TopicSuggestion) {
        if (savingTopics[index] || savedTopics[index]) return;
        setSavingTopics(prev => ({ ...prev, [index]: true }));

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: topic.topic,
                    estimated_minutes: 25,
                    source: 'coaching',
                }),
            });

            if (res.ok) {
                setSavedTopics(prev => ({ ...prev, [index]: true }));
            }
        } catch (err) {
            console.error('[Analysis] Save topic error:', err);
        } finally {
            setSavingTopics(prev => ({ ...prev, [index]: false }));
        }
    }

    function toggleQuote(index: number) {
        setExpandedQuotes(prev => ({ ...prev, [index]: !prev[index] }));
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: BLUE }} />
            </div>
        );
    }

    if (!report) {
        const handleCancel = () => {
            if (pollRef.current) clearInterval(pollRef.current);
            pollStartTimeRef.current = null;
            router.push('/dashboard/coaching');
        };

        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    {analysisTimedOut ? (
                        <>
                            <AlertCircle className="h-6 w-6 mx-auto text-red-400" />
                            <p className="text-sm mt-3 font-medium" style={{ color: TEXT }}>
                                {t('analysis_timeout')}
                            </p>
                            <p className="text-xs mt-1" style={{ color: MUTED }}>
                                {t('analysis_timeout_desc')}
                            </p>
                        </>
                    ) : (
                        <div className="w-full max-w-md mx-auto text-left">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <Loader2 className="w-6 h-6 animate-spin shrink-0" style={{ color: BLUE }} />
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: BLUE }}>{t('analysis_loading')}</p>
                                    <p className="text-xs mt-0.5" style={{ color: MUTED }}>{t('analysis_time')}</p>
                                </div>
                            </div>

                            {/* Step list */}
                            <div className="space-y-2.5">
                                {ANALYSIS_STEPS.map((label, i) => {
                                    const isDone = i < analysisStep;
                                    const isActive = i === analysisStep;
                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.08 }}
                                            className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${isDone ? 'bg-[#2B5EA7]/5' :
                                                    isActive ? 'bg-[#2B5EA7]/10 border border-[#2B5EA7]/20' :
                                                        'opacity-30'
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all ${isDone ? 'bg-[#2B5EA7] text-white' :
                                                    isActive ? 'border-2 border-[#2B5EA7] text-[#2B5EA7]' :
                                                        'border border-gray-300 text-gray-400'
                                                }`}>
                                                {isDone ? '✓' : i + 1}
                                            </div>
                                            <span className={`text-sm ${isDone ? 'text-[#2B5EA7] line-through opacity-60' :
                                                    isActive ? 'text-[#2B5EA7] font-medium' :
                                                        'text-gray-400'
                                                }`}>
                                                {label}
                                            </span>
                                            {isActive && (
                                                <motion.div
                                                    className="ml-auto w-3 h-3 rounded-full"
                                                    style={{ background: BLUE }}
                                                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                                                    transition={{ repeat: Infinity, duration: 1.2 }}
                                                />
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleCancel}
                        className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-red-50"
                        style={{
                            color: analysisTimedOut ? '#2B5EA7' : '#DC2626',
                            border: `1px solid ${analysisTimedOut ? '#2B5EA7' : '#FECACA'}`,
                            background: 'transparent',
                        }}
                    >
                        {analysisTimedOut ? (
                            <><ArrowLeft className="w-3.5 h-3.5" /> {t('back_overview')}</>
                        ) : (
                            <><XCircle className="w-3.5 h-3.5" /> {t('cancel_btn')}</>
                        )}
                    </button>
                    {analysisTimedOut && (
                        <button
                            onClick={() => {
                                setAnalysisTimedOut(false);
                                setLoading(true);
                                loadData();
                            }}
                            className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-blue-50"
                            style={{
                                color: BLUE,
                                border: `1px solid ${BLUE}`,
                                background: 'transparent',
                            }}
                        >
                            {t('retry')}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Detect broken report (fallback: empty arrays, no real content)
    const isBrokenReport = report && (
        (!report.dimensions || report.dimensions.length === 0) &&
        (!report.strengths || report.strengths.length === 0) &&
        (!report.improvements || report.improvements.length === 0)
    );

    async function regenerateReport() {
        setRegenerating(true);
        try {
            const res = await fetch(`/api/coaching/session/${sessionId}/complete?regenerate=true`, { method: 'POST' });
            if (res.ok) {
                setReport(null);
                setAnalysisTimedOut(false);
                startPolling();
            }
        } catch (err) {
            console.error('[Analysis] Regenerate error:', err);
        } finally {
            setRegenerating(false);
        }
    }

    // If report is broken, show a prominent re-generate prompt
    if (isBrokenReport) {
        return (
            <div className="max-w-3xl pb-16">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => router.push('/dashboard/coaching')} className="p-1 rounded transition-colors hover:bg-[#F0EFED]">
                        <ArrowLeft className="h-5 w-5" style={{ color: MUTED }} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: TEXT }}>{t('title')}</h1>
                        <p className="text-sm" style={{ color: MUTED }}>{jobTitle} · {companyName}</p>
                    </div>
                </div>

                <div className="rounded-xl p-6 text-center" style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}22` }}>
                    <AlertCircle className="h-8 w-8 mx-auto mb-3" style={{ color: BLUE }} />
                    <p className="text-sm font-medium" style={{ color: TEXT }}>
                        {t('broken_title')}
                    </p>
                    <p className="text-xs mt-1 mb-4" style={{ color: MUTED }}>
                        {t('broken_desc')}
                    </p>
                    <button
                        onClick={regenerateReport}
                        disabled={regenerating}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-60"
                        style={{ background: BLUE }}
                    >
                        {regenerating ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> {t('regenerating')}</>
                        ) : (
                            t('regenerate_btn')
                        )}
                    </button>
                </div>
            </div>
        );
    }

    const toggleSection = (id: number) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

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
                        {t('title')}
                    </h1>
                    <p className="text-sm" style={{ color: MUTED }}>
                        {jobTitle} · {companyName}
                    </p>
                </div>
            </div>

            {/* ─── Table-style toggle sections ─────────────────────────── */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>

                {/* ── Section 1: Overall Score ─────────────────────────── */}
                <div style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <button
                        onClick={() => toggleSection(1)}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#F7F6F5] group"
                    >
                        <motion.div
                            animate={{ rotate: openSections[1] ? 90 : 0 }}
                            transition={{ duration: 0.15 }}
                            className="shrink-0"
                        >
                            <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                        </motion.div>
                        <span className="text-sm font-medium" style={{ color: TEXT }}>
                            {t('overall_score')}
                        </span>
                    </button>


                    <AnimatePresence initial={false}>
                        {openSections[1] && (
                            <motion.div
                                key="s1"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                            >
                                <div className="px-6 pb-5 pt-1">
                                    {(report.whatWorked || report.whatWasMissing || report.recruiterAdvice) ? (
                                        <div className="space-y-3">
                                            {report.whatWorked && (
                                                <div className="rounded-lg px-4 py-3 border-l-4" style={{ borderLeftColor: '#16a34a', background: '#f0fdf4' }}>
                                                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#15803d' }}>{t('what_worked')}</p>
                                                    <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{report.whatWorked}</p>
                                                </div>
                                            )}
                                            {report.whatWasMissing && (
                                                <div className="rounded-lg px-4 py-3 border-l-4" style={{ borderLeftColor: '#ea580c', background: '#fff7ed' }}>
                                                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>{t('what_missing')}</p>
                                                    <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{report.whatWasMissing}</p>
                                                </div>
                                            )}
                                            {report.recruiterAdvice && (
                                                <div className="rounded-lg px-4 py-3 border-l-4" style={{ borderLeftColor: BLUE, background: `${BLUE}0D` }}>
                                                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: BLUE }}>{t('recommendation')}</p>
                                                    <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{report.recruiterAdvice}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {report.topStrength && (
                                                <div className="flex items-start gap-2">
                                                    <TrendingUp className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BLUE }} />
                                                    <p className="text-sm leading-relaxed" style={{ color: TEXT }}
                                                        dangerouslySetInnerHTML={{ __html: renderBold(report.topStrength) }} />
                                                </div>
                                            )}
                                            {report.recommendation && (
                                                <div className="flex items-start gap-2">
                                                    <Target className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
                                                    <p className="text-sm leading-relaxed" style={{ color: TEXT }}
                                                        dangerouslySetInnerHTML={{ __html: renderBold(report.recommendation) }} />
                                                </div>
                                            )}
                                            {!report.topStrength && !report.recommendation && report.summary && (
                                                <p className="text-sm" style={{ color: TEXT }}>{report.summary}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Section 2: In Detail ─────────────────────────────── */}
                {report.dimensions && report.dimensions.length > 0 && (
                    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <button
                            onClick={() => toggleSection(2)}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#F7F6F5]"
                        >
                            <motion.div
                                animate={{ rotate: openSections[2] ? 90 : 0 }}
                                transition={{ duration: 0.15 }}
                                className="shrink-0"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: TEXT }}>
                                {t('in_detail')}
                            </span>
                            <span className="ml-auto text-xs" style={{ color: MUTED }}>
                                {report.dimensions.length}
                            </span>
                        </button>

                        <AnimatePresence initial={false}>
                            {openSections[2] && (
                                <motion.div
                                    key="s2"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 pb-4 pt-1 space-y-3">
                                        {report.dimensions.map((dim, i) => {
                                            const tagColor = TAG_COLORS[dim.level as DimensionLevel] || TAG_COLORS.yellow;
                                            const isQuoteOpen = expandedQuotes[i] || false;

                                            return (
                                                <div
                                                    key={i}
                                                    className="rounded-xl p-4"
                                                    style={{ border: `1px solid ${BORDER}` }}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-sm font-semibold" style={{ color: TEXT }}>{dim.name}</span>
                                                        <span
                                                            className="text-xs font-medium px-3 py-1 rounded-full"
                                                            style={{ background: tagColor.bg, color: tagColor.text }}
                                                        >
                                                            {dim.tag}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-2">
                                                        {dim.observation && (
                                                            <div className="flex items-start gap-2">
                                                                <span className="text-xs font-semibold shrink-0 mt-0.5 w-24" style={{ color: BLUE }}>{t('we_see')}</span>
                                                                <p className="text-sm" style={{ color: TEXT }} dangerouslySetInnerHTML={{ __html: renderBold(dim.observation) }} />
                                                            </div>
                                                        )}
                                                        {dim.reason && (
                                                            <div className="flex items-start gap-2">
                                                                <span className="text-xs font-semibold shrink-0 mt-0.5 w-24" style={{ color: MUTED }}>{t('because')}</span>
                                                                <p className="text-sm" style={{ color: TEXT }} dangerouslySetInnerHTML={{ __html: renderBold(dim.reason) }} />
                                                            </div>
                                                        )}
                                                        {dim.suggestion && (
                                                            <div className="flex items-start gap-2">
                                                                <span className="text-xs font-semibold shrink-0 mt-0.5 w-24" style={{ color: '#2E7D32' }}>{t('we_recommend')}</span>
                                                                <p className="text-sm" style={{ color: TEXT }} dangerouslySetInnerHTML={{ __html: renderBold(dim.suggestion) }} />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {!dim.observation && !dim.reason && !dim.suggestion && dim.feedback && (
                                                        <p className="text-sm" style={{ color: TEXT }} dangerouslySetInnerHTML={{ __html: renderBold(dim.feedback) }} />
                                                    )}

                                                    {dim.quote && (
                                                        <div className="mt-3">
                                                            <button
                                                                onClick={() => toggleQuote(i)}
                                                                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                                                                style={{ color: MUTED }}
                                                            >
                                                                <MessageSquareQuote className="h-3.5 w-3.5" />
                                                                <span>{t('show_quote')}</span>
                                                                <ChevronDown
                                                                    className="h-3 w-3 transition-transform"
                                                                    style={{ transform: isQuoteOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                                                />
                                                            </button>
                                                            {isQuoteOpen && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, height: 0 }}
                                                                    animate={{ opacity: 1, height: 'auto' }}
                                                                    exit={{ opacity: 0, height: 0 }}
                                                                    className="mt-2 rounded-lg px-3 py-2.5 border-l-[3px]"
                                                                    style={{ background: '#F7F6F5', borderLeftColor: BLUE }}
                                                                >
                                                                    <p className="text-sm italic" style={{ color: MUTED }}>
                                                                        &ldquo;{dim.quote}&rdquo;
                                                                    </p>
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* ── Section 3: In General (Strengths + Improvements) ─── */}
                {((report.strengths && report.strengths.length > 0) || (report.improvements && report.improvements.length > 0)) && (
                    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <button
                            onClick={() => toggleSection(3)}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#F7F6F5]"
                        >
                            <motion.div
                                animate={{ rotate: openSections[3] ? 90 : 0 }}
                                transition={{ duration: 0.15 }}
                                className="shrink-0"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: TEXT }}>
                                {t('in_general')}
                            </span>
                        </button>

                        <AnimatePresence initial={false}>
                            {openSections[3] && (
                                <motion.div
                                    key="s3"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {report.strengths && report.strengths.length > 0 && (
                                            <div className="rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <TrendingUp className="h-4 w-4" style={{ color: BLUE }} />
                                                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BLUE }}>
                                                        {t('convincing')}
                                                    </p>
                                                </div>
                                                <ul className="space-y-2">
                                                    {report.strengths.map((s, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                                            <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: BLUE }} />
                                                            <span dangerouslySetInnerHTML={{ __html: renderBold(s) }} />
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {report.improvements && report.improvements.length > 0 && (
                                            <div className="rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Target className="h-4 w-4" style={{ color: BLUE }} />
                                                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BLUE }}>
                                                        {t('improvement')}
                                                    </p>
                                                </div>
                                                <div className="space-y-3">
                                                    {report.improvements.map((imp, i) => {
                                                        const item = typeof imp === 'string' ? { title: imp, bad: '', good: '' } : imp;
                                                        return (
                                                            <div key={i}>
                                                                {item.bad || item.good ? (
                                                                    <div className="rounded-lg p-2.5" style={{ background: '#F7F6F5' }}>
                                                                        {item.bad && (
                                                                            <div className="flex items-start gap-2 mb-1">
                                                                                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: BLUE }} />
                                                                                <p className="text-xs" style={{ color: MUTED }}><em>&ldquo;{item.bad}&rdquo;</em></p>
                                                                            </div>
                                                                        )}
                                                                        {item.good && (
                                                                            <div className="flex items-start gap-2">
                                                                                <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: BLUE }} />
                                                                                <p className="text-xs" style={{ color: TEXT }}
                                                                                    dangerouslySetInnerHTML={{ __html: `&ldquo;${renderBold(item.good)}&rdquo;` }} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                                                        <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: BLUE }} />
                                                                        <span dangerouslySetInnerHTML={{ __html: renderBold(item.title) }} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* ── Section 4: Topics to Explore ─────────────────────── */}
                {report.topicSuggestions && report.topicSuggestions.length > 0 && (
                    <div>
                        <button
                            onClick={() => toggleSection(4)}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#F7F6F5]"
                        >
                            <motion.div
                                animate={{ rotate: openSections[4] ? 90 : 0 }}
                                transition={{ duration: 0.15 }}
                                className="shrink-0"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                            </motion.div>
                            <span className="text-sm font-medium" style={{ color: TEXT }}>
                                {t('topics_title')}
                            </span>
                            <span className="ml-auto text-xs" style={{ color: MUTED }}>
                                {report.topicSuggestions.length}
                            </span>
                        </button>

                        <AnimatePresence initial={false}>
                            {openSections[4] && (
                                <motion.div
                                    key="s4"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 pb-4 pt-1 space-y-3">
                                        {report.topicSuggestions.map((raw, i) => {
                                            const topic = normalizeTopic(raw);
                                            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.searchQuery)}`;
                                            const isSaved = savedTopics[i] || false;
                                            const isSaving = savingTopics[i] || false;

                                            return (
                                                <div
                                                    key={i}
                                                    className="rounded-lg p-4"
                                                    style={{ background: '#F7F6F5', border: `1px solid ${BORDER}` }}
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <p className="text-sm font-semibold" style={{ color: TEXT }}>{topic.topic}</p>
                                                        {topic.category && (
                                                            <span
                                                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                                                                style={{
                                                                    background: topic.category === 'rolle' ? '#E8EFF8' : '#F0FDF4',
                                                                    color: topic.category === 'rolle' ? BLUE : '#15803d',
                                                                }}
                                                            >
                                                                {topic.category === 'rolle' ? t('for_role') : t('interview_technique')}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {topic.context && topic.context.length > 0 && (
                                                        <ul className="space-y-1.5 mb-3">
                                                            {topic.context.map((line, ci) => (
                                                                <li key={ci} className="text-xs leading-relaxed flex items-start gap-2" style={{ color: MUTED }}>
                                                                    <span className="mt-1 shrink-0" style={{ color: BLUE }}>•</span>
                                                                    <span>{line}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}

                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={youtubeUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 shrink-0"
                                                            style={{ background: '#FF000015', color: '#CC0000' }}
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                            <span className="hidden sm:inline max-w-[200px] truncate">{topic.youtubeTitle}</span>
                                                            <span className="sm:hidden">YouTube</span>
                                                        </a>
                                                        <button
                                                            onClick={() => saveTopicToGoals(i, topic)}
                                                            disabled={isSaving || isSaved}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                                                            style={{
                                                                background: isSaved ? '#4CAF5020' : `${BLUE}15`,
                                                                color: isSaved ? '#4CAF50' : BLUE,
                                                            }}
                                                        >
                                                            {isSaving ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : isSaved ? (
                                                                <>
                                                                    <CheckCircle className="h-3.5 w-3.5" />
                                                                    <span className="hidden sm:inline">{t('saved_topic')}</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Bookmark className="h-3.5 w-3.5" />
                                                                    <span className="hidden sm:inline">{t('save_topic')}</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

            </div>

            {/* Regenerate button (outside toggle container) */}
            <div className="mt-4 flex justify-end">
                <button
                    onClick={regenerateReport}
                    disabled={regenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
                    style={{ color: MUTED, border: `1px solid ${BORDER}`, background: 'transparent' }}
                >
                    {regenerating ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('regenerating')}</>
                    ) : (
                        t('regenerate_btn')
                    )}
                </button>
            </div>
        </div>
    );
}
