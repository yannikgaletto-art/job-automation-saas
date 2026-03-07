'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Send,
    Loader2,
    ChevronRight,
    Lightbulb,
    Mic,
    Square,
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

interface HintData {
    [turnNumber: number]: string;
}

export default function CoachingSessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;
    const notify = useNotification();

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

    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/coaching/session?sessionId=${sessionId}`);
                if (res.ok) {
                    const { session } = await res.json();
                    if (session.feedback_report) {
                        if (pollRef.current) clearInterval(pollRef.current);
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

            if (!res.ok) throw new Error('Nachricht konnte nicht gesendet werden');

            const data = await res.json();

            if (data.hint) {
                setHints((prev) => ({ ...prev, [data.turnNumber]: data.hint }));
            }

            const aiMsg: ChatMessage = {
                role: 'coach',
                content: data.aiMessage,
                timestamp: new Date().toISOString(),
                turnNumber: data.turnNumber,
            };
            setMessages((prev) => [...prev, aiMsg]);
            setTurnCount(data.turnNumber);

            // If AI asks for analysis → show the prompt button
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
            notify('Coaching abgeschlossen');
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
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: BLUE }} />
                    <p className="text-sm mt-3" style={{ color: TEXT }}>
                        Dein Interview wird analysiert...
                    </p>
                    <p className="text-xs mt-1" style={{ color: MUTED }}>
                        Das dauert ca. 10-15 Sekunden.
                    </p>
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
                            <span className="text-xs font-medium" style={{ color: MUTED }}>Gap-Analyse</span>
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
                                            <h4 className="text-xs font-semibold mb-1" style={{ color: BLUE }}>Stärken</h4>
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
                                <span className="text-xs font-medium" style={{ color: MUTED }}>About the Role</span>
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
                                    {roleData ? 'Neu analysieren' : 'Analysieren'}
                                </button>
                            )}
                            {analyzingRole && (
                                <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: MUTED }}>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Analysiert...</span>
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
                                                    <h5 className="text-xs font-semibold mb-1" style={{ color: TEXT }}>Konkrete Aufgaben und Daily Business</h5>
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
                                                    <h5 className="text-xs font-semibold mb-1" style={{ color: TEXT }}>Cases im Alltag</h5>
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
                                                    <h5 className="text-xs font-semibold mb-1" style={{ color: TEXT }}>Arbeitsweisen und Methodik</h5>
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
                                            {analyzingRole ? 'Wird analysiert...' : 'Klicke „Analysieren" um Infos zur Rolle zu laden.'}
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
                                <span className="text-xs font-medium" style={{ color: MUTED }}>Meine Geschichte</span>
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
                                    {myStoryData.length > 0 ? 'Neu analysieren' : 'Analysieren'}
                                </button>
                            )}
                            {analyzingStory && (
                                <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: MUTED }}>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Analysiert...</span>
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
                                            {analyzingRole ? 'Wird analysiert...' : 'Klicke „Analysieren" um deine Geschichte zu generieren.'}
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
                                                <span className="font-medium">Wie du antworten kannst</span>
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
                                    Yannik, vielen Dank für das Gespräch! Wenn du willst, kannst du{' '}
                                    <button
                                        onClick={requestAnalysis}
                                        className="font-semibold underline underline-offset-2 transition-colors hover:opacity-80"
                                        style={{ color: BLUE }}
                                    >
                                        Hier
                                    </button>{' '}
                                    klicken und dir deine Analyse anschauen.
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
                                            Aufnahme läuft
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
                                        Wird transkribiert...
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
                                placeholder="Deine Antwort..."
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
                                        ? 'Kein Mikrofon verfügbar'
                                        : voice.state === 'recording'
                                            ? 'Aufnahme stoppen'
                                            : 'Sprachmemo aufnehmen'
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
