'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Clock, Star, Loader2 } from 'lucide-react';
import { DocumentsRequiredDialog } from '@/components/shared/documents-required-dialog';

const BLUE = '#2B5EA7';
const BLUE_LIGHT = '#E8EFF8';
const BLUE_DARK = '#1E4A8A';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

type InterviewRound = 'kennenlernen' | 'deep_dive' | 'case_study';

const ROUND_OPTIONS: { value: InterviewRound; label: string; desc: string }[] = [
    { value: 'kennenlernen', label: 'Erstes Kennenlernen', desc: 'Allgemeiner Austausch über Motivation und Werdegang' },
    { value: 'deep_dive', label: 'Zweites Gespräch (Deep Dive)', desc: 'Fachliche Vertiefung und technische Fragen' },
    { value: 'case_study', label: 'Case Study', desc: 'Praxisnahes Szenario zum Durcharbeiten' },
];

// Progress steps shown during session creation
const PROGRESS_STEPS = [
    { label: 'Lebenslauf laden', duration: 2000 },
    { label: 'Job-Profil analysieren', duration: 3000 },
    { label: 'Gap-Analyse erstellen', duration: 5000 },
    { label: 'Interview vorbereiten', duration: 4000 },
    { label: 'Erste Frage generieren', duration: 3000 },
];

interface JobForCoaching {
    id: string;
    job_title: string;
    company_name: string;
    location: string | null;
    status: string;
}

interface PastSession {
    id: string;
    job_id: string;
    session_status: string;
    coaching_score: number | null;
    turn_count: number;
    created_at: string;
    completed_at: string | null;
}

export default function CoachingPage() {
    const router = useRouter();
    const [jobs, setJobs] = useState<JobForCoaching[]>([]);
    const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [jobsOpen, setJobsOpen] = useState(true);
    const [sessionsOpen, setSessionsOpen] = useState(true);

    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    // Modal state
    const [selectedJob, setSelectedJob] = useState<JobForCoaching | null>(null);
    const [modalStep, setModalStep] = useState<'round' | 'questions' | 'creating'>('round');
    const [selectedRound, setSelectedRound] = useState<InterviewRound>('kennenlernen');
    const [questionCount, setQuestionCount] = useState(5);

    // Progress bar state
    const [currentProgressStep, setCurrentProgressStep] = useState(0);
    const [progressPercent, setProgressPercent] = useState(0);
    const [showCvDialog, setShowCvDialog] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            const [jobsRes, sessionsRes] = await Promise.all([
                fetch('/api/jobs/list'),
                fetch('/api/coaching/session'),
            ]);

            if (jobsRes.ok) {
                const jobsData = await jobsRes.json();
                setJobs(
                    (jobsData.jobs || []).filter(
                        (j: JobForCoaching) => j.job_title && j.company_name
                    )
                );
            }

            if (sessionsRes.ok) {
                const sessionsData = await sessionsRes.json();
                const sessions = sessionsData.sessions || [];
                setPastSessions(sessions);

                // Show active session banner instead of auto-redirecting
                const activeSession = sessions.find((s: PastSession) => s.session_status === 'active');
                if (activeSession) {
                    setActiveSessionId(activeSession.id);
                    setActiveJobId(activeSession.job_id);
                }
            }
        } catch (err) {
            console.error('[Coaching] Failed to load data:', err);
        } finally {
            setLoading(false);
        }
    }

    function openModal(job: JobForCoaching) {
        setSelectedJob(job);
        setModalStep('round');
        setSelectedRound('kennenlernen');
        setQuestionCount(5);
        setCurrentProgressStep(0);
        setProgressPercent(0);
    }

    function closeModal() {
        setSelectedJob(null);
        setModalStep('round');
    }

    async function startSession() {
        if (!selectedJob) return;
        setModalStep('creating');

        // Simulate progress steps while the API call runs
        let step = 0;
        const totalSteps = PROGRESS_STEPS.length;
        const stepInterval = setInterval(() => {
            step++;
            if (step < totalSteps) {
                setCurrentProgressStep(step);
                setProgressPercent(Math.round((step / totalSteps) * 100));
            }
        }, 2500);

        try {
            const res = await fetch('/api/coaching/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: selectedJob.id,
                    maxQuestions: questionCount,
                    interviewRound: selectedRound,
                }),
            });

            clearInterval(stepInterval);
            setProgressPercent(100);
            setCurrentProgressStep(totalSteps - 1);

            if (!res.ok) {
                const data = await res.json();
                if (data.code === 'CV_NOT_FOUND') {
                    setShowCvDialog(true);
                    return;
                }
                throw new Error(data.error || 'Fehler');
            }

            const data = await res.json();

            // Short delay for visual completion
            await new Promise((r) => setTimeout(r, 500));
            router.push(`/dashboard/coaching/${data.sessionId}`);
        } catch (err) {
            clearInterval(stepInterval);
            console.error('[Coaching] Session creation failed:', err);
            alert('Session konnte nicht erstellt werden.');
            closeModal();
        }
    }

    function getJobSessions(jobId: string) {
        return pastSessions.filter((s) => s.job_id === jobId);
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: MUTED }} />
            </div>
        );
    }

    const completedSessions = pastSessions.filter((s) => s.session_status === 'completed');

    return (
        <div className="max-w-3xl">
            <DocumentsRequiredDialog
                open={showCvDialog}
                onClose={() => setShowCvDialog(false)}
                type="cv"
            />
            <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-3xl font-bold mb-1"
                style={{ color: TEXT }}
            >
                Interview Coaching
            </motion.h1>
            <p className="text-sm mb-8" style={{ color: MUTED }}>
                Übe Vorstellungsgespräche mit einem KI-Coach, personalisiert auf deine Jobs.
            </p>

            {/* ─── Active Session Resume Banner ────────────── */}
            {activeSessionId && (
                <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 mb-6 flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ background: BLUE_LIGHT, border: `1px solid ${BLUE}33` }}
                    onClick={() => router.push(`/dashboard/coaching/${activeSessionId}`)}
                >
                    <div>
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                            Laufendes Interview
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                            {jobs.find(j => j.id === activeJobId)?.company_name || 'In Bearbeitung'} — Klicke um fortzufahren
                        </p>
                    </div>
                    <button
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: BLUE }}
                    >
                        Fortsetzen
                    </button>
                </motion.div>
            )}

            {jobs.length === 0 && (
                <div className="py-12">
                    <p style={{ color: TEXT }}>Keine Jobs vorhanden.</p>
                    <p className="text-sm mt-1" style={{ color: MUTED }}>
                        Füge zuerst Jobs zu deiner Queue hinzu.
                    </p>
                    <button
                        onClick={() => router.push('/dashboard/job-search')}
                        className="mt-4 text-sm underline underline-offset-2"
                        style={{ color: BLUE }}
                    >
                        Jobsuche starten
                    </button>
                </div>
            )}

            {/* ─── Config Modal ──────────────────────────────────────── */}
            <AnimatePresence>
                {selectedJob && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                        onClick={modalStep !== 'creating' ? closeModal : undefined}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-xl p-6 w-[440px] shadow-xl"
                            style={{ background: '#FAFAF9', border: `1px solid ${BORDER}` }}
                        >
                            {/* ── Step: Creating (Progress Bar) ──── */}
                            {modalStep === 'creating' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        Interview wird vorbereitet...
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} bei {selectedJob.company_name}
                                    </p>

                                    {/* Progress bar */}
                                    <div className="h-2 rounded-full mb-4" style={{ background: BLUE_LIGHT }}>
                                        <motion.div
                                            className="h-2 rounded-full"
                                            style={{ background: BLUE }}
                                            initial={{ width: '5%' }}
                                            animate={{ width: `${Math.max(progressPercent, 5)}%` }}
                                            transition={{ duration: 0.5 }}
                                        />
                                    </div>

                                    {/* Step labels */}
                                    <div className="space-y-2">
                                        {PROGRESS_STEPS.map((step, i) => (
                                            <div key={i} className="flex items-center gap-2.5">
                                                {i < currentProgressStep ? (
                                                    <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: BLUE }}>
                                                        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                                                    </div>
                                                ) : i === currentProgressStep ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: BLUE }} />
                                                ) : (
                                                    <div className="w-4 h-4 rounded-full" style={{ background: BORDER }} />
                                                )}
                                                <span
                                                    className="text-sm"
                                                    style={{
                                                        color: i <= currentProgressStep ? TEXT : MUTED,
                                                        fontWeight: i === currentProgressStep ? 500 : 400,
                                                    }}
                                                >
                                                    {step.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Step: Round Selector ──── */}
                            {modalStep === 'round' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        Interview konfigurieren
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} bei {selectedJob.company_name}
                                    </p>

                                    <label className="text-xs font-medium block mb-3" style={{ color: TEXT }}>
                                        In welcher Gesprächsrunde befinden Sie sich?
                                    </label>
                                    <div className="space-y-2 mb-6">
                                        {ROUND_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setSelectedRound(opt.value)}
                                                className="w-full text-left rounded-lg px-4 py-3 transition-colors"
                                                style={{
                                                    background: selectedRound === opt.value ? BLUE_LIGHT : '#F0EFED',
                                                    border: `1.5px solid ${selectedRound === opt.value ? BLUE : 'transparent'}`,
                                                }}
                                            >
                                                <span className="text-sm font-medium" style={{ color: TEXT }}>
                                                    {opt.label}
                                                </span>
                                                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                                                    {opt.desc}
                                                </p>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={closeModal}
                                            className="flex-1 py-2.5 text-sm transition-colors"
                                            style={{ color: MUTED }}
                                        >
                                            Abbrechen
                                        </button>
                                        <button
                                            onClick={() => setModalStep('questions')}
                                            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                                            style={{ background: BLUE }}
                                        >
                                            Weiter
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Step: Question Count ──── */}
                            {modalStep === 'questions' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        Interview konfigurieren
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} bei {selectedJob.company_name}
                                    </p>

                                    <label className="text-xs font-medium block mb-3" style={{ color: TEXT }}>
                                        Wie viele Fragen möchtest du?
                                    </label>
                                    <div className="flex gap-2 mb-6">
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <button
                                                key={n}
                                                onClick={() => setQuestionCount(n)}
                                                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
                                                style={{
                                                    background: questionCount === n ? BLUE : '#F0EFED',
                                                    color: questionCount === n ? 'white' : TEXT,
                                                }}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setModalStep('round')}
                                            className="flex-1 py-2.5 text-sm transition-colors"
                                            style={{ color: MUTED }}
                                        >
                                            Zurück
                                        </button>
                                        <button
                                            onClick={startSession}
                                            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                                            style={{ background: BLUE }}
                                        >
                                            Interview starten
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Toggle: Wähle einen Job ──────────────────────────── */}
            {jobs.length > 0 && (
                <div className="mb-6">
                    <button
                        onClick={() => setJobsOpen(!jobsOpen)}
                        className="flex items-center gap-1.5 py-1 w-full text-left"
                    >
                        <ChevronRight
                            className={`h-4 w-4 transition-transform duration-150 ${jobsOpen ? 'rotate-90' : ''}`}
                            style={{ color: MUTED }}
                        />
                        <span className="font-medium text-sm" style={{ color: TEXT }}>
                            Wähle einen Job für dein Interview
                        </span>
                        <span className="text-xs ml-2" style={{ color: MUTED }}>
                            {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}
                        </span>
                    </button>

                    <AnimatePresence initial={false}>
                        {jobsOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="ml-5 mt-1 border-l" style={{ borderColor: BORDER }}>
                                    {jobs.map((job) => {
                                        const sessions = getJobSessions(job.id);
                                        const bestScore = sessions.reduce(
                                            (max, s) =>
                                                s.coaching_score && s.coaching_score > max ? s.coaching_score : max,
                                            0
                                        );
                                        return (
                                            <div
                                                key={job.id}
                                                onClick={() => openModal(job)}
                                                className="flex items-center justify-between pl-4 pr-2 py-2.5 hover:bg-[#F7F6F3] transition-colors rounded-r group/row cursor-pointer"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium truncate" style={{ color: TEXT }}>
                                                            {job.company_name}
                                                        </span>
                                                        {sessions.length > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: BLUE_LIGHT, color: MUTED }}>
                                                                <Clock className="h-2.5 w-2.5" />
                                                                {sessions.length}x
                                                            </span>
                                                        )}
                                                        {bestScore > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: BLUE_LIGHT, color: BLUE }}>
                                                                <Star className="h-2.5 w-2.5" />
                                                                {bestScore}/10
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                                                        {job.job_title}{job.location ? ` · ${job.location}` : ''}
                                                    </p>
                                                </div>
                                                <span className="text-sm opacity-0 group-hover/row:opacity-100 flex items-center gap-1 shrink-0 ml-4 italic" style={{ color: MUTED }}>
                                                    Interview starten
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ─── Toggle: Abgeschlossene Sessions ─────────────────── */}
            {completedSessions.length > 0 && (
                <div className="mb-6">
                    <button
                        onClick={() => setSessionsOpen(!sessionsOpen)}
                        className="flex items-center gap-1.5 py-1 w-full text-left"
                    >
                        <ChevronRight
                            className={`h-4 w-4 transition-transform duration-150 ${sessionsOpen ? 'rotate-90' : ''}`}
                            style={{ color: MUTED }}
                        />
                        <span className="font-medium text-sm" style={{ color: TEXT }}>Abgeschlossene Sessions</span>
                        <span className="text-xs ml-2" style={{ color: MUTED }}>{completedSessions.length}</span>
                    </button>
                    <AnimatePresence initial={false}>
                        {sessionsOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="ml-5 mt-1 border-l" style={{ borderColor: BORDER }}>
                                    {completedSessions.map((session) => {
                                        const job = jobs.find((j) => j.id === session.job_id);
                                        return (
                                            <div
                                                key={session.id}
                                                onClick={() => router.push(`/dashboard/coaching/${session.id}/analysis`)}
                                                className="flex items-center justify-between pl-4 pr-2 py-2.5 hover:bg-[#F7F6F3] transition-colors rounded-r cursor-pointer group/row"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium truncate" style={{ color: TEXT }}>
                                                            {job?.company_name || 'Unbekannt'}
                                                        </span>
                                                        <span className="text-[10px]" style={{ color: MUTED }}>
                                                            {new Date(session.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                                                        {job?.job_title || ''} · {session.turn_count} Fragen
                                                    </p>
                                                </div>
                                                {session.coaching_score && (
                                                    <div className="flex items-center gap-1 text-xs shrink-0 ml-4">
                                                        <Star className="h-3 w-3" style={{ color: BLUE }} />
                                                        <span className="font-medium" style={{ color: BLUE }}>{session.coaching_score}/10</span>
                                                    </div>
                                                )}
                                                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover/row:opacity-100 ml-2" style={{ color: MUTED }} />
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
    );
}
