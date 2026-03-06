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
import type { ChatMessage, CoachingDossier } from '@/types/coaching';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
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
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: BLUE_LIGHT }}>
                            <motion.div
                                className="h-1.5 rounded-full"
                                style={{ background: BLUE }}
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
                                            <ul className="text-xs space-y-1" style={{ color: MUTED }}>
                                                {dossier.strengths.map((s, i) => <li key={i}>+ {s}</li>)}
                                            </ul>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-semibold text-orange-600 mb-1">Gaps</h4>
                                            <ul className="text-xs space-y-1" style={{ color: MUTED }}>
                                                {dossier.gaps.map((g, i) => <li key={i}>- {g}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
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
                            <div className="rounded-xl p-4 text-center" style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}22` }}>
                                <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>
                                    Möchtest du eine Auswertung deines Interviews?
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => setShowAnalysisPrompt(false)}
                                        className="px-4 py-2 text-sm rounded-lg transition-colors"
                                        style={{ color: MUTED }}
                                    >
                                        Nein, danke
                                    </button>
                                    <button
                                        onClick={requestAnalysis}
                                        className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors"
                                        style={{ background: BLUE }}
                                    >
                                        Ja, auswerten
                                    </button>
                                </div>
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
