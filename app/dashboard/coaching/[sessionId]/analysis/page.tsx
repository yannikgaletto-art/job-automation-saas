'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    Loader2,
    CheckCircle,
    Star,
    BookOpen,
    Target,
    TrendingUp,
    Bookmark,
    MessageSquareQuote,
    ChevronDown,
    ExternalLink,
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

/** Key terms to auto-bold in text that lacks markdown bold markers */
const BOLD_KEYWORDS = [
    'STAR-Methode', 'Kundenmanagement', 'Erwartungsmanagement', 'Stakeholder',
    'Transparenz', 'Lösungsorientierung', 'Kommunikation', 'Selbstreflexion',
    'Authentizität', 'Cultural Fit', 'Problemlösung', 'Praxisbeispiele',
    'konkrete Beispiele', 'strukturierte', 'Verhandlungsführung', 'Storytelling',
    'Account Management', 'Führung', 'Strategie', 'Überzeugungskraft',
    'Kundenzentrierung', 'B2B', 'Kundenbedürfnisse', 'Grundprinzipien',
    'Hands-on', 'Entrepreneurship', 'Co-Founder', 'Fallstudien', 'Metriken',
    'Füllwörter', 'STAR', 'Situation', 'Task', 'Action', 'Result',
    'konzeptionell', 'improvisiert', 'Nachfragen', 'Grenzen', 'Learnings',
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

    const [report, setReport] = useState<FeedbackReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [savedTopics, setSavedTopics] = useState<Record<number, boolean>>({});
    const [savingTopics, setSavingTopics] = useState<Record<number, boolean>>({});
    const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>({});
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
            let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            if (!cleaned.startsWith('{')) {
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) cleaned = match[0];
            }
            const parsed = JSON.parse(cleaned);

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
                summary: 'Der Report konnte nicht korrekt geladen werden. Bitte starte eine neue Session.',
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

            {/* ─── Overall Score (Bullet Points) ──────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-5 mb-6"
                style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}22` }}
            >
                <div className="flex items-center justify-between mb-4">
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

                {/* Recruiter-style feedback (new fields) */}
                {(report.whatWorked || report.whatWasMissing || report.recruiterAdvice) ? (
                    <div className="space-y-3 mt-2">
                        {report.whatWorked && (
                            <div className="rounded-lg px-4 py-3 border-l-4" style={{ borderLeftColor: '#16a34a', background: '#f0fdf4' }}>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#15803d' }}>Was gut lief</p>
                                <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{report.whatWorked}</p>
                            </div>
                        )}
                        {report.whatWasMissing && (
                            <div className="rounded-lg px-4 py-3 border-l-4" style={{ borderLeftColor: '#ea580c', background: '#fff7ed' }}>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>Was gefehlt hat</p>
                                <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{report.whatWasMissing}</p>
                            </div>
                        )}
                        {report.recruiterAdvice && (
                            <div className="rounded-lg px-4 py-3 border-l-4" style={{ borderLeftColor: BLUE, background: `${BLUE}0D` }}>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: BLUE }}>Empfehlung</p>
                                <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{report.recruiterAdvice}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Fallback for older reports without new fields */
                    <div className="space-y-2 mt-2">
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
            </motion.div>

            {/* ─── Im Detail (Colored Tags) ─────────────────────────── */}
            {report.dimensions && report.dimensions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-8"
                >
                    <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: MUTED }}>
                        Im Detail
                    </p>
                    <div className="space-y-5">
                        {report.dimensions.map((dim, i) => {
                            const tagColor = TAG_COLORS[dim.level as DimensionLevel] || TAG_COLORS.yellow;
                            const isQuoteOpen = expandedQuotes[i] || false;

                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 * i }}
                                    className="rounded-xl p-4"
                                    style={{ border: `1px solid ${BORDER}` }}
                                >
                                    {/* Header: Name + Tag */}
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-base font-semibold" style={{ color: TEXT }}>
                                            {dim.name}
                                        </span>
                                        <span
                                            className="text-xs font-medium px-3 py-1 rounded-full"
                                            style={{ background: tagColor.bg, color: tagColor.text }}
                                        >
                                            {dim.tag}
                                        </span>
                                    </div>

                                    {/* Structured Feedback: Wir sehen / Das liegt daran / Wir empfehlen */}
                                    <div className="space-y-2">
                                        {dim.observation && (
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs font-semibold shrink-0 mt-0.5 w-24" style={{ color: BLUE }}>Wir sehen:</span>
                                                <p
                                                    className="text-sm"
                                                    style={{ color: TEXT }}
                                                    dangerouslySetInnerHTML={{ __html: renderBold(dim.observation) }}
                                                />
                                            </div>
                                        )}
                                        {dim.reason && (
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs font-semibold shrink-0 mt-0.5 w-24" style={{ color: MUTED }}>Das liegt daran:</span>
                                                <p
                                                    className="text-sm"
                                                    style={{ color: TEXT }}
                                                    dangerouslySetInnerHTML={{ __html: renderBold(dim.reason) }}
                                                />
                                            </div>
                                        )}
                                        {dim.suggestion && (
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs font-semibold shrink-0 mt-0.5 w-24" style={{ color: '#2E7D32' }}>Wir empfehlen:</span>
                                                <p
                                                    className="text-sm"
                                                    style={{ color: TEXT }}
                                                    dangerouslySetInnerHTML={{ __html: renderBold(dim.suggestion) }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Fallback: old-style feedback if no observation/reason/suggestion */}
                                    {!dim.observation && !dim.reason && !dim.suggestion && dim.feedback && (
                                        <p className="text-sm" style={{ color: TEXT }}
                                            dangerouslySetInnerHTML={{ __html: renderBold(dim.feedback) }}
                                        />
                                    )}

                                    {/* Collapsible Quote Evidence */}
                                    {dim.quote && (
                                        <div className="mt-3">
                                            <button
                                                onClick={() => toggleQuote(i)}
                                                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                                                style={{ color: MUTED }}
                                            >
                                                <MessageSquareQuote className="h-3.5 w-3.5" />
                                                <span>Zitat anzeigen</span>
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
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* ─── Überzeugend + Verbesserungspotenzial (Side-by-Side) ── */}
            {((report.strengths && report.strengths.length > 0) || (report.improvements && report.improvements.length > 0)) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
                >
                    {/* Left: Überzeugend */}
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
                                        <span dangerouslySetInnerHTML={{ __html: renderBold(s) }} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Right: Verbesserungspotenzial */}
                    {report.improvements && report.improvements.length > 0 && (
                        <div className="rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                            <div className="flex items-center gap-2 mb-3">
                                <Target className="h-4 w-4 text-orange-500" />
                                <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                                    Verbesserungspotenzial
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
                                                            <span className="text-xs shrink-0">❌</span>
                                                            <p className="text-xs" style={{ color: MUTED }}>
                                                                <em>&ldquo;{item.bad}&rdquo;</em>
                                                            </p>
                                                        </div>
                                                    )}
                                                    {item.good && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs shrink-0">✅</span>
                                                            <p
                                                                className="text-xs"
                                                                style={{ color: TEXT }}
                                                                dangerouslySetInnerHTML={{ __html: `&ldquo;${renderBold(item.good)}&rdquo;` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-start gap-2 text-sm" style={{ color: TEXT }}>
                                                    <span className="text-orange-500 mt-0.5">›</span>
                                                    <span dangerouslySetInnerHTML={{ __html: renderBold(item.title) }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ─── Zusammenfassung: Themen zum Vertiefen ───────────────── */}
            {report.topicSuggestions && report.topicSuggestions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-xl p-4 mb-6"
                    style={{ border: `1px solid ${BORDER}` }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="h-4 w-4" style={{ color: BLUE }} />
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BLUE }}>
                            Zusammenfassung: Themen zum Vertiefen
                        </p>
                    </div>

                    {/* Table layout: Empfehlung | YouTube Link | Save Button */}
                    <div className="space-y-3">
                        {report.topicSuggestions.map((raw, i) => {
                            const topic = normalizeTopic(raw);
                            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.searchQuery)}`;
                            const isSaved = savedTopics[i] || false;
                            const isSaving = savingTopics[i] || false;

                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 p-3 rounded-lg"
                                    style={{ background: '#F7F6F5', border: `1px solid ${BORDER}` }}
                                >
                                    {/* Left: Empfehlung */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                                            {topic.topic}
                                        </p>
                                    </div>

                                    {/* Middle: YouTube Link */}
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

                                    {/* Right: Save to Today's Goals */}
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
                                                <span className="hidden sm:inline">Gespeichert</span>
                                            </>
                                        ) : (
                                            <>
                                                <Bookmark className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">Todays Goals</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
