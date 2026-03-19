'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Send,
    Loader2,
    ChevronRight,
    Lightbulb,
    Mic,
    Square,
    XCircle,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';
import type { ChatMessage, CoachingDossier, AboutRole } from '@/types/coaching';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { useNotification } from '@/hooks/use-notification';
import { VoiceConsentModal } from '@/components/coaching/voice-consent-modal';

const BLUE = '#2B5EA7';
const BLUE_LIGHT = '#E8EFF8';
const BLUE_DARK = '#1E4A8A';
const BG = '#FAFAF9';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

// Analysis steps shown while the coaching report is generated in the background.
// The last step intentionally stays "active" indefinitely — it never completes
// until Inngest finishes and the page redirects to /analysis.
// Analysis steps are now loaded from translations via the `t` function inside the component.

// CancelButton that appears after 10s (analysis is typically 10–15s).
function AnalysisCancelButton({ onCancel, cancelLabel }: AnalysisCancelProps) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 10000);
        return () => clearTimeout(timer);
    }, []);
    if (!visible) return null;
    return (
        <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{ color: '#DC2626', border: '1px solid #FECACA', background: 'transparent' }}
        >
            <XCircle className="w-3.5 h-3.5" /> {cancelLabel}
        </motion.button>
    );
}

interface HintData {
    [turnNumber: number]: string;
}

interface AnalysisCancelProps {
    onCancel: () => void;
    cancelLabel: string;
}

export default function CoachingSessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;
    const notify = useNotification();
    const t = useTranslations('dashboard.coaching.session');

    const ANALYSIS_STEPS = useMemo(() => [
        t('analysis_step_1'),
        t('analysis_step_2'),
        t('analysis_step_3'),
        t('analysis_step_4'),
    ], [t]);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [sessionStatus, setSessionStatus] = useState<string>('active');
    const [dossier, setDossier] = useState<CoachingDossier | null>(null);
    const [dossierOpen, setDossierOpen] = useState(false);
    const [turnCount, setTurnCount] = useState(0);
    const [maxQuestions, setMaxQuestions] = useState(5);
    const [loading, setLoading] = useState(true);
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [hints, setHints] = useState<HintData>({});
    const [openHints, setOpenHints] = useState<{ [key: number]: boolean }>({});
    const [showAnalysisPrompt, setShowAnalysisPrompt] = useState(false);
    const [requestingAnalysis, setRequestingAnalysis] = useState(false);
    const [analysisTimedOut, setAnalysisTimedOut] = useState(false);
    const [analysisProgressStep, setAnalysisProgressStep] = useState(0);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [roleData, setRoleData] = useState<AboutRole | null>(null);
    const [myStoryData, setMyStoryData] = useState<string[]>([]);
    const [analyzingRole, setAnalyzingRole] = useState(false);
    const [analyzingStory, setAnalyzingStory] = useState(false);
    const [roleOpen, setRoleOpen] = useState(false);
    const [storyOpen, setStoryOpen] = useState(false);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    // Voice recorder hook
    const voice = useVoiceRecorder({
        onTranscription: (text) => {
            // Place transcribed text in the textarea for user review
            setInput((prev) => (prev ? prev + ' ' + text : text));
            inputRef.current?.focus();
        },
        onError: (msg) => {
            setVoiceError(msg);
            setTimeout(() => setVoiceError(null), 4000);
        },
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, showAnalysisPrompt]);

    // Drive analysis step progress while polling for the report.
    // Advances every 3s up to (but NOT past) the last step — it stays active
    // indefinitely so there's always visible feedback during the 120s window.
    useEffect(() => {
        if (!requestingAnalysis) {
            setAnalysisProgressStep(0);
            return;
        }
        let step = 0;
        setAnalysisProgressStep(0);
        const interval = setInterval(() => {
            step++;
            setAnalysisProgressStep(step);
            // Stop advancing when last step is active (index = ANALYSIS_STEPS.length - 1).
            // It stays "active" (never done) until the redirect fires.
            if (step >= ANALYSIS_STEPS.length - 1) clearInterval(interval);
        }, 3000);
        return () => clearInterval(interval);
    }, [requestingAnalysis]);

    useEffect(() => {
        loadSession();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    async function loadSession() {
        try {
            const res = await fetch(`/api/coaching/session?sessionId=${sessionId}`);
            if (!res.ok) {
                router.push('/dashboard/coaching');
                return;
            }
            const { session } = await res.json();
            setMessages(session.conversation_history || []);
            setSessionStatus(session.session_status);
            setDossier(session.coaching_dossier);
            setTurnCount(session.turn_count || 0);
            setMaxQuestions(session.max_questions || 5);

            // QA fix: Restore farewell state on page reload
            if (session.session_status === 'active' && (session.turn_count || 0) >= (session.max_questions || 5)) {
                setShowAnalysisPrompt(true);
            }

            // Load persisted role research data from dossier
            if (session.coaching_dossier?.aboutRole) {
                setRoleData(session.coaching_dossier.aboutRole);
            }
            if (session.coaching_dossier?.myStory && Array.isArray(session.coaching_dossier.myStory)) {
                setMyStoryData(session.coaching_dossier.myStory);
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

            // If completed with report → go to analysis
            if (session.session_status === 'completed' && session.feedback_report) {
                router.push(`/dashboard/coaching/${sessionId}/analysis`);
                return;
            }
            // If completed but no report → poll
            if (session.session_status === 'completed' && !session.feedback_report) {
                setRequestingAnalysis(true);
                startPolling();
            }
        } catch (err) {
            console.error('[Coaching] Load session error:', err);
        } finally {
            setLoading(false);
        }
    }

    const pollStartTimeRef = useRef<number | null>(null);

    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollStartTimeRef.current = Date.now();
        pollRef.current = setInterval(async () => {
            // 90s timeout — fail fast and surface a proper retry UI
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
                        router.push(`/dashboard/coaching/${sessionId}/analysis`);
                    }
                }
            } catch { /* ignore */ }
        }, 3000);
    }, [sessionId, router]);

    async function sendMessage() {
        if (!input.trim() || sending) return;
        const userMessage = input.trim();
        setInput('');
        setSending(true);

        const optimisticMsg: ChatMessage = {
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimisticMsg]);

        try {
            const res = await fetch(`/api/coaching/session/${sessionId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage }),
            });

            if (!res.ok) throw new Error(t('send_error'));

            const data = await res.json();

            if (data.hint) {
                setHints((prev) => ({ ...prev, [data.turnNumber]: data.hint }));
            }

            // Only add AI message if there is one (last turn returns empty to skip follow-up question)
            if (data.aiMessage) {
                const aiMsg: ChatMessage = {
                    role: 'coach',
                    content: data.aiMessage,
                    timestamp: new Date().toISOString(),
                    turnNumber: data.turnNumber,
                };
                setMessages((prev) => [...prev, aiMsg]);
            }

            setTurnCount(data.turnNumber);

            // Session complete → show farewell immediately, no extra AI turn
            if (data.isComplete) {
                setShowAnalysisPrompt(true);
            }
        } catch (err) {
            console.error('[Coaching] Send error:', err);
            setMessages((prev) => prev.slice(0, -1));
            setInput(userMessage);
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    }

    async function requestAnalysis() {
        setRequestingAnalysis(true);
        setShowAnalysisPrompt(false);
        try {
            await fetch(`/api/coaching/session/${sessionId}/complete`, { method: 'POST' });
            notify(t('coaching_complete'));
            startPolling();
        } catch {
            setRequestingAnalysis(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function toggleHint(turnNumber: number) {
        setOpenHints((prev) => ({ ...prev, [turnNumber]: !prev[turnNumber] }));
    }

    const progress = maxQuestions > 0 ? Math.min((turnCount / maxQuestions) * 100, 100) : 0;

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: MUTED }} />
            </div>
        );
    }

    if (requestingAnalysis) {
        const handleCancelAnalysis = () => {
            if (pollRef.current) clearInterval(pollRef.current);
            pollStartTimeRef.current = null;
            setRequestingAnalysis(false);
            setAnalysisTimedOut(false);
            router.push('/dashboard/coaching');
        };

        return (
            <div className="flex-1 flex flex-col items-center justify-center" style={{ background: BG }}>
                {/* Centered pop card */}
                <div
                    className="w-full max-w-md rounded-2xl shadow-lg p-8"
                    style={{ background: '#ffffff', border: `1px solid ${BORDER}` }}
                >
                    {/* Job info */}
                    <h1 className="text-lg font-semibold" style={{ color: TEXT }}>
                        {jobTitle || 'Mock Interview'}
                    </h1>
                    <p className="text-xs mb-6" style={{ color: MUTED }}>{companyName}</p>

                    {analysisTimedOut ? (
                        /* ─── Timeout error state ─── */
                        <div>
                            <AlertCircle className="h-6 w-6 text-red-400 mb-3" />
                            <p className="text-sm font-medium" style={{ color: TEXT }}>
                                {t('analysis_timeout')}
                            </p>
                            <p className="text-xs mt-1 mb-4" style={{ color: MUTED }}>
                                {t('analysis_timeout_desc')}
                            </p>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        setAnalysisTimedOut(false);
                                        startPolling();
                                    }}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-blue-50"
                                    style={{ color: BLUE, border: `1px solid ${BLUE}`, background: 'transparent' }}
                                >
                                    {t('retry')}
                                </button>
                                <button
                                    onClick={handleCancelAnalysis}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors"
                                    style={{ color: MUTED }}
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> {t('back_overview')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ─── Step list (pop card style) ─── */
                        <>
                            {/* Header */}
                            <div className="flex items-center gap-2.5 mb-1">
                                <Loader2 className="w-5 h-5 text-[#002e7a] animate-spin shrink-0" />
                                <span className="text-sm font-semibold text-[#37352F]">
                                    {t('analysis_title')}
                                </span>
                            </div>
                            <p className="text-xs text-[#73726E] mb-5 pl-[29px]">{t('analysis_time')}</p>

                            {/* Steps */}
                            <div className="space-y-2">
                                {ANALYSIS_STEPS.map((label, i) => {
                                    const isDone = i < analysisProgressStep;
                                    const isActive = i === analysisProgressStep;
                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -6 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.07, duration: 0.25 }}
                                            className={[
                                                'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-300',
                                                isDone
                                                    ? 'bg-[#EEF2FF] border-[#C7D6F7]'
                                                    : isActive
                                                        ? 'bg-white border-[#002e7a] shadow-sm'
                                                        : 'bg-white border-[#E7E7E5]',
                                            ].join(' ')}
                                        >
                                            {/* Badge */}
                                            <div className={[
                                                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300',
                                                isDone
                                                    ? 'bg-[#002e7a] text-white'
                                                    : isActive
                                                        ? 'border-2 border-[#002e7a] bg-white text-[#002e7a]'
                                                        : 'border border-[#D0CFC8] bg-white text-[#A8A29E]',
                                            ].join(' ')}>
                                                {isDone ? <CheckCircle2 size={13} /> : <span>{i + 1}</span>}
                                            </div>

                                            {/* Label */}
                                            <span className={[
                                                'text-xs flex-1 transition-all duration-300',
                                                isDone
                                                    ? 'line-through text-[#002e7a] opacity-60'
                                                    : isActive
                                                        ? 'font-semibold text-[#37352F]'
                                                        : 'font-normal text-[#A8A29E]',
                                            ].join(' ')}>
                                                {label}
                                            </span>

                                            {/* Static grey dot for active step */}
                                            {isActive && (
                                                <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>

                            {/* Cancel — appears after 10s, routes to coaching overview */}
                            <AnalysisCancelButton onCancel={handleCancelAnalysis} cancelLabel={t('cancel_btn')} />
                        </>
                    )}
                </div>
            </div>
        );
    }


    return (
        <div className="flex-1 flex flex-col h-[calc(100vh-64px)]" style={{ background: BG }}>
            {/* ─── Header ─────────────────────────────────────────── */}
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/dashboard/coaching')}
                            className="p-1 rounded transition-colors hover:bg-[#F0EFED]"
                        >
                            <ArrowLeft className="h-5 w-5" style={{ color: MUTED }} />
                        </button>
                        <div>
                            <h1 className="text-lg font-semibold" style={{ color: TEXT }}>
                                {jobTitle || 'Mock Interview'}
                            </h1>
                            <p className="text-xs" style={{ color: MUTED }}>{companyName}</p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-[#E7E7E5] overflow-hidden">
                            <motion.div
                                className="h-1.5 rounded-full bg-gradient-to-r from-[#002e7a] to-[#3B82F6]"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                        <span className="text-xs font-medium shrink-0" style={{ color: MUTED }}>
                            {Math.min(turnCount, maxQuestions)}/{maxQuestions}
                        </span>
                    </div>
                </div>
            </div>

            {/* ─── Gap-Analyse Toggle ────────────────────────────── */}
            {dossier && (
                <div className="px-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <div className="max-w-3xl mx-auto">
                        <button
                            onClick={() => setDossierOpen(!dossierOpen)}
                            className="flex items-center gap-1.5 py-2 w-full text-left"
                        >
                            <ChevronRight
                                className={`h-3.5 w-3.5 transition-transform duration-150 ${dossierOpen ? 'rotate-90' : ''}`}
                                style={{ color: MUTED }}
                            />
                            <span className="text-xs font-medium" style={{ color: MUTED }}>{t('gap_analysis')}</span>
                        </button>
                        <AnimatePresence>
                            {dossierOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden pb-3 ml-5 border-l pl-4"
                                    style={{ borderColor: BORDER }}
                                >
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <h4 className="text-xs font-semibold mb-1" style={{ color: BLUE }}>{t('strengths')}</h4>
                                            <ul className="text-xs space-y-1.5" style={{ color: MUTED }}>
                                                {dossier.strengths.map((s, i) => (
                                                    <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{
                                                        __html: '+ ' + s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                    }} />
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-semibold text-orange-600 mb-1">Gaps</h4>
                                            <ul className="text-xs space-y-1.5" style={{ color: MUTED }}>
                                                {dossier.gaps.map((g, i) => (
                                                    <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{
                                                        __html: '- ' + g.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                    }} />
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── About the Role — Analysieren scoped to this category only ── */}
                        <div className="flex items-center w-full">
                            <button
                                onClick={() => setRoleOpen(!roleOpen)}
                                className="flex items-center gap-1.5 py-2 flex-1 text-left"
                            >
                                <ChevronRight
                                    className={`h-3.5 w-3.5 transition-transform duration-150 ${roleOpen ? 'rotate-90' : ''}`}
                                    style={{ color: MUTED }}
                                />
                                <span className="text-xs font-medium" style={{ color: MUTED }}>{t('about_the_role')}</span>
                            </button>
                            {!analyzingRole && (
                                <button
                                    onClick={async () => {
                                        setAnalyzingRole(true);
                                        try {
                                            const res = await fetch('/api/coaching/role-research', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ sessionId, category: 'aboutRole', force: !roleData ? undefined : true }),
                                            });
                                            if (res.ok) {
                                                const data = await res.json();
                                                if (data.aboutRole) {
                                                    setRoleData(data.aboutRole);
                                                    setRoleOpen(true);
                                                }
                                            }
                                        } catch (e) {
                                            console.error('[Coaching] Role research failed:', e);
                                        } finally {
                                            setAnalyzingRole(false);
                                        }
                                    }}
                                    disabled={analyzingStory}
                                    className="text-xs px-2.5 py-1 rounded-md border transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ borderColor: BORDER, color: MUTED, background: 'transparent' }}
                                >
                                    {roleData ? t('reanalyze_btn') : t('analyze_btn')}
                                </button>
                            )}
                            {analyzingRole && (
                                <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: MUTED }}>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{t('analyzing')}</span>
                                </div>
                            )}
                        </div>
                        <AnimatePresence>
                            {roleOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden ml-5 border-l pl-4 pb-2"
                                    style={{ borderColor: BORDER }}
                                >
                                    {roleData ? (
                                        <div className="space-y-3">
                                            {roleData.dailyBusiness.length > 0 && (
                                                <div>
                                                    <h5 className="text-xs font-semibold mb-1" style={{ color: TEXT }}>{t('role_daily')}</h5>
                                                    <ul className="text-xs space-y-1.5" style={{ color: MUTED }}>
                                                        {roleData.dailyBusiness.map((item, i) => (
                                                            <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{
                                                                __html: '• ' + item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                            }} />
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {roleData.cases.length > 0 && (
                                                <div>
                                                    <h5 className="text-xs font-semibold mb-1" style={{ color: TEXT }}>{t('role_cases')}</h5>
                                                    <ul className="text-xs space-y-1.5" style={{ color: MUTED }}>
                                                        {roleData.cases.map((item, i) => (
                                                            <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{
                                                                __html: '• ' + item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                            }} />
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {roleData.methodology.length > 0 && (
                                                <div>
                                                    <h5 className="text-xs font-semibold mb-1" style={{ color: TEXT }}>{t('role_methods')}</h5>
                                                    <ul className="text-xs space-y-1.5" style={{ color: MUTED }}>
                                                        {roleData.methodology.map((item, i) => (
                                                            <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{
                                                                __html: '• ' + item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                            }} />
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs italic py-1" style={{ color: MUTED }}>
                                            {analyzingRole ? t('role_loading') : t('role_empty')}
                                        </p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Meine Geschichte — Analysieren scoped to this category only ── */}
                        <div className="flex items-center w-full">
                            <button
                                onClick={() => setStoryOpen(!storyOpen)}
                                className="flex items-center gap-1.5 py-2 flex-1 text-left"
                            >
                                <ChevronRight
                                    className={`h-3.5 w-3.5 transition-transform duration-150 ${storyOpen ? 'rotate-90' : ''}`}
                                    style={{ color: MUTED }}
                                />
                                <span className="text-xs font-medium" style={{ color: MUTED }}>{t('my_story')}</span>
                            </button>
                            {!analyzingStory && (
                                <button
                                    onClick={async () => {
                                        setAnalyzingStory(true);
                                        try {
                                            const res = await fetch('/api/coaching/role-research', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ sessionId, category: 'myStory', force: myStoryData.length === 0 ? undefined : true }),
                                            });
                                            if (res.ok) {
                                                const data = await res.json();
                                                if (data.myStory) {
                                                    setMyStoryData(data.myStory);
                                                    setStoryOpen(true);
                                                }
                                            }
                                        } catch (e) {
                                            console.error('[Coaching] Story research failed:', e);
                                        } finally {
                                            setAnalyzingStory(false);
                                        }
                                    }}
                                    disabled={analyzingRole}
                                    className="text-xs px-2.5 py-1 rounded-md border transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ borderColor: BORDER, color: MUTED, background: 'transparent' }}
                                >
                                    {myStoryData.length > 0 ? t('reanalyze_btn') : t('analyze_btn')}
                                </button>
                            )}
                            {analyzingStory && (
                                <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: MUTED }}>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{t('analyzing')}</span>
                                </div>
                            )}
                        </div>
                        <AnimatePresence>
                            {storyOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden ml-5 border-l pl-4 pb-2"
                                    style={{ borderColor: BORDER }}
                                >
                                    {myStoryData.length > 0 ? (
                                        <ul className="text-xs space-y-2" style={{ color: MUTED }}>
                                            {myStoryData.map((bullet, i) => (
                                                <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{
                                                    __html: bullet.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                }} />
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs italic py-1" style={{ color: MUTED }}>
                                            {analyzingRole ? t('story_loading') : t('story_empty')}
                                        </p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="pb-1" />
                    </div>
                </div>
            )}

            {/* ─── Messages ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-3xl mx-auto space-y-4">
                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => {
                            const isUser = msg.role === 'user';
                            const turnHint = msg.turnNumber ? hints[msg.turnNumber] : undefined;
                            const isHintOpen = msg.turnNumber ? openHints[msg.turnNumber] : false;

                            return (
                                <div key={`${msg.role}-${i}`}>
                                    {/* Hint toggle: appears AFTER user message */}
                                    {isUser && turnHint && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-2">
                                            <button
                                                onClick={() => toggleHint(msg.turnNumber!)}
                                                className="flex items-center gap-1.5 text-xs py-1 transition-colors hover:opacity-80"
                                                style={{ color: BLUE }}
                                            >
                                                <ChevronRight
                                                    className={`h-3 w-3 transition-transform duration-150 ${isHintOpen ? 'rotate-90' : ''}`}
                                                />
                                                <Lightbulb className="h-3 w-3" />
                                                <span className="font-medium">{t('hint_how')}</span>
                                            </button>
                                            <AnimatePresence>
                                                {isHintOpen && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden ml-5 mt-1 border-l pl-3"
                                                        style={{ borderColor: BLUE_LIGHT }}
                                                    >
                                                        <p className="text-xs whitespace-pre-wrap leading-relaxed py-1" style={{ color: MUTED }}>
                                                            {turnHint}
                                                        </p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    )}

                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className="max-w-[80%] rounded-2xl px-4 py-3"
                                            style={{
                                                background: isUser ? BLUE : '#F0EFED',
                                                color: isUser ? 'white' : TEXT,
                                            }}
                                        >
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                        </div>
                                    </motion.div>
                                </div>
                            );
                        })}
                    </AnimatePresence>

                    {/* Typing indicator */}
                    {sending && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                            <div className="rounded-2xl px-4 py-3" style={{ background: '#F0EFED' }}>
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: MUTED, animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: MUTED, animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: MUTED, animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── Analysis Prompt (User confirms) ─────────── */}
                    {showAnalysisPrompt && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-center py-4"
                        >
                            <div className="rounded-xl p-5 text-center max-w-md" style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}22` }}>
                                <p className="text-sm leading-relaxed" style={{ color: TEXT }}>
                                    <button
                                        onClick={requestAnalysis}
                                        className="font-semibold underline underline-offset-2 transition-colors hover:opacity-80"
                                        style={{ color: BLUE }}
                                    >
                                        {t('here_link')}
                                    </button>{' '}
                                    {t('go_to_analysis')}
                                </p>
                            </div>
                        </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* ─── DSGVO Voice Consent Modal ───────────────────── */}
            <VoiceConsentModal
                isOpen={voice.needsConsent}
                onAllow={voice.grantConsent}
                onDeny={voice.denyConsent}
            />

            {/* ─── Voice Error Toast ──────────────────────────────── */}
            <AnimatePresence>
                {voiceError && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 rounded-lg px-4 py-2.5 shadow-lg"
                        style={{ background: TEXT, color: 'white' }}
                    >
                        <p className="text-sm">{voiceError}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Input Area ────────────────────────────────────── */}
            {sessionStatus === 'active' && !showAnalysisPrompt && (
                <div className="px-6 py-4" style={{ borderTop: `1px solid ${BORDER}`, background: BG }}>
                    <div className="max-w-3xl mx-auto">
                        {/* Recording indicator */}
                        <AnimatePresence>
                            {voice.state === 'recording' && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg"
                                    style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
                                >
                                    <div className="flex items-center gap-2">
                                        <motion.div
                                            className="w-2.5 h-2.5 rounded-full bg-red-500"
                                            animate={{ opacity: [1, 0.3, 1] }}
                                            transition={{ duration: 1.2, repeat: Infinity }}
                                        />
                                        <span className="text-sm font-medium" style={{ color: '#DC2626' }}>
                                            {t('recording')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-mono tabular-nums" style={{ color: '#DC2626' }}>
                                            {voice.elapsedSeconds}s / 60s
                                        </span>
                                        {/* Progress bar for 60s limit */}
                                        <div className="w-20 h-1.5 rounded-full bg-red-100">
                                            <div
                                                className="h-1.5 rounded-full bg-red-500 transition-all duration-1000"
                                                style={{ width: `${Math.min((voice.elapsedSeconds / 60) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Transcribing indicator */}
                        <AnimatePresence>
                            {voice.state === 'transcribing' && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
                                    style={{ background: '#E8EFF8', border: `1px solid ${BLUE}22` }}
                                >
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: BLUE }} />
                                    <span className="text-sm" style={{ color: BLUE }}>
                                        {t('transcribing')}
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex items-end gap-3">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t('your_answer')}
                                rows={2}
                                className="flex-1 resize-none rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                                style={{ background: '#F0EFED', color: TEXT, border: `1px solid ${BORDER}` }}
                                onFocus={(e) => (e.target.style.borderColor = BLUE)}
                                onBlur={(e) => (e.target.style.borderColor = BORDER)}
                                disabled={sending || voice.state === 'transcribing'}
                            />

                            {/* Mic button */}
                            <button
                                onClick={voice.state === 'recording' ? voice.stopRecording : voice.startRecording}
                                disabled={sending || voice.state === 'transcribing' || !voice.isMicAvailable}
                                className="p-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{
                                    background: voice.state === 'recording' ? '#DC2626' : '#F0EFED',
                                    color: voice.state === 'recording' ? 'white' : MUTED,
                                    border: `1px solid ${voice.state === 'recording' ? '#DC2626' : BORDER}`,
                                }}
                                title={
                                    !voice.isMicAvailable
                                        ? t('no_mic')
                                        : voice.state === 'recording'
                                            ? t('stop_recording')
                                            : t('record_voice')
                                }
                            >
                                {voice.state === 'recording'
                                    ? <Square className="h-5 w-5" />
                                    : <Mic className="h-5 w-5" />}
                            </button>

                            {/* Send button */}
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || sending}
                                className="p-3 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{ background: BLUE, color: 'white' }}
                            >
                                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
