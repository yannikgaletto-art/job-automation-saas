'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Clock, Star, Loader2, Building2, BriefcaseBusiness, PlayCircle, ExternalLink, FileText } from 'lucide-react';
import { DocumentsRequiredDialog } from '@/components/shared/documents-required-dialog';

const BLUE = '#2B5EA7';
const BLUE_LIGHT = '#E8EFF8';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

type InterviewRound = 'kennenlernen' | 'deep_dive' | 'case_study';

const ROUND_OPTIONS: { value: InterviewRound; label: string; desc: string }[] = [
    { value: 'kennenlernen', label: 'Erstes Kennenlernen', desc: 'Allgemeiner Austausch über Motivation und Werdegang' },
    { value: 'deep_dive', label: 'Zweites Gespräch (Deep Dive)', desc: 'Fachliche Vertiefung und technische Fragen' },
    { value: 'case_study', label: 'Case Study', desc: 'Praxisnahes Szenario zum Durcharbeiten' },
];

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
    // Steckbrief fields
    summary?: string | null;
    seniority?: string | null;
    responsibilities?: string[] | null;
    qualifications?: string[] | null;
    benefits?: string[] | null;
    buzzwords?: string[] | null;
    source_url?: string | null;
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

    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    // Modal state
    const [selectedJob, setSelectedJob] = useState<JobForCoaching | null>(null);
    const [modalStep, setModalStep] = useState<'cv' | 'round' | 'questions' | 'creating'>('round');
    const [selectedRound, setSelectedRound] = useState<InterviewRound>('kennenlernen');
    const [questionCount, setQuestionCount] = useState(5);

    // CV selection state
    const [userCvs, setUserCvs] = useState<{ id: string; name: string; createdAt: string }[]>([]);
    const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
    const [loadingCvs, setLoadingCvs] = useState(false);

    // Progress bar state
    const [currentProgressStep, setCurrentProgressStep] = useState(0);
    const [progressPercent, setProgressPercent] = useState(0);
    const [showCvDialog, setShowCvDialog] = useState(false);

    // Expanded row for completed sessions
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

    // Steckbrief inline toggle
    const [steckbriefExpandedId, setSteckbriefExpandedId] = useState<string | null>(null);

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

    async function openModal(job: JobForCoaching) {
        setSelectedJob(job);
        setSelectedRound('kennenlernen');
        setQuestionCount(5);
        setCurrentProgressStep(0);
        setProgressPercent(0);
        setSelectedCvId(null);

        // Fetch user CVs to decide whether to show CV picker
        setLoadingCvs(true);
        setModalStep('cv'); // show loading state
        try {
            const res = await fetch('/api/coaching/cv-list');
            if (res.ok) {
                const data = await res.json();
                const cvs = data.cvs || [];
                setUserCvs(cvs);
                if (cvs.length <= 1) {
                    // Auto-select the only CV (or none) and skip to round
                    if (cvs.length === 1) setSelectedCvId(cvs[0].id);
                    setModalStep('round');
                } else {
                    // Multiple CVs → show picker
                    setSelectedCvId(cvs[0].id);
                    setModalStep('cv');
                }
            } else {
                // Couldn't fetch CVs, skip step
                setModalStep('round');
            }
        } catch {
            setModalStep('round');
        } finally {
            setLoadingCvs(false);
        }
    }

    function closeModal() {
        setSelectedJob(null);
        setModalStep('round');
    }

    async function startSession() {
        if (!selectedJob) return;
        setModalStep('creating');

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
                    ...(selectedCvId ? { documentId: selectedCvId } : {}),
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
        <div className="w-full">
            <DocumentsRequiredDialog
                open={showCvDialog}
                onClose={() => setShowCvDialog(false)}
                type="cv"
            />

            {/* ─── Header ──────────────────────────────────────────────── */}
            <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-2xl font-bold mb-1"
                style={{ color: TEXT }}
            >
                Interview Coaching
            </motion.h1>
            <p className="text-sm mb-8" style={{ color: MUTED }}>
                Übe Vorstellungsgespräche mit einem KI-Coach, personalisiert auf deine Jobs.
            </p>

            {/* ─── Active Session Banner ────────────────────────────────── */}
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

            {/* ─── Empty State ─────────────────────────────────────────── */}
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

            {/* ─── Config Modal ─────────────────────────────────────────── */}
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
                            {/* ── Creating (Progress) ── */}
                            {modalStep === 'creating' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        Interview wird vorbereitet...
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} bei {selectedJob.company_name}
                                    </p>
                                    <div className="w-full">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-xs font-semibold" style={{ color: '#002e7a' }}>
                                                {PROGRESS_STEPS[currentProgressStep]?.label ?? 'Vorbereitung...'}
                                            </span>
                                            <span className="text-xs" style={{ color: '#A8A29E' }}>{progressPercent}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-[#E7E7E5] rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-gradient-to-r from-[#002e7a] to-[#3B82F6] rounded-full"
                                                initial={{ width: '5%' }}
                                                animate={{ width: `${Math.max(progressPercent, 5)}%` }}
                                                transition={{ duration: 0.5 }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 w-full justify-center mt-3 mb-3">
                                        {PROGRESS_STEPS.map((_, i) => (
                                            <div key={i} className="flex items-center gap-1.5">
                                                <div className={[
                                                    'w-2 h-2 rounded-full transition-all duration-300',
                                                    i < currentProgressStep ? 'bg-[#22C55E]' :
                                                        i === currentProgressStep ? 'bg-[#002e7a] scale-125' :
                                                            'bg-[#E7E7E5]',
                                                ].join(' ')} />
                                                {i < PROGRESS_STEPS.length - 1 && (
                                                    <div className={[
                                                        'h-px w-5 transition-colors duration-500',
                                                        i < currentProgressStep ? 'bg-[#22C55E]' : 'bg-[#E7E7E5]',
                                                    ].join(' ')} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-center mb-4" style={{ color: '#A8A29E' }}>Dauert ca. 15–20 Sekunden</p>
                                </div>
                            )}

                            {/* ── CV Selection ── */}
                            {modalStep === 'cv' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        Lebenslauf wählen
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} bei {selectedJob.company_name}
                                    </p>
                                    {loadingCvs ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin" style={{ color: BLUE }} />
                                        </div>
                                    ) : (
                                        <>
                                            <label className="text-xs font-medium block mb-3" style={{ color: TEXT }}>
                                                Welchen Lebenslauf möchtest du verwenden?
                                            </label>
                                            <div className="space-y-2 mb-6">
                                                {userCvs.map((cv) => (
                                                    <button
                                                        key={cv.id}
                                                        onClick={() => setSelectedCvId(cv.id)}
                                                        className="w-full text-left rounded-lg px-4 py-3 transition-colors flex items-center gap-3"
                                                        style={{
                                                            background: selectedCvId === cv.id ? BLUE_LIGHT : '#F0EFED',
                                                            border: `1.5px solid ${selectedCvId === cv.id ? BLUE : 'transparent'}`,
                                                        }}
                                                    >
                                                        <FileText className="w-4 h-4 shrink-0" style={{ color: selectedCvId === cv.id ? BLUE : MUTED }} />
                                                        <div className="min-w-0">
                                                            <span className="text-sm font-medium block truncate" style={{ color: TEXT }}>
                                                                {cv.name}
                                                            </span>
                                                            <span className="text-[10px]" style={{ color: MUTED }}>
                                                                Hochgeladen am {new Date(cv.createdAt).toLocaleDateString('de-DE')}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={closeModal} className="flex-1 py-2.5 text-sm transition-colors" style={{ color: MUTED }}>
                                                    Abbrechen
                                                </button>
                                                <button
                                                    onClick={() => setModalStep('round')}
                                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                                                    style={{ background: BLUE }}
                                                >
                                                    Weiter
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── Round Selector ── */}
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
                                                <p className="text-xs mt-0.5" style={{ color: MUTED }}>{opt.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={closeModal} className="flex-1 py-2.5 text-sm transition-colors" style={{ color: MUTED }}>
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

                            {/* ── Question Count ── */}
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
                                        <button onClick={() => setModalStep('round')} className="flex-1 py-2.5 text-sm transition-colors" style={{ color: MUTED }}>
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

            {/* ─── Jobs Table ──────────────────────────────────────────── */}
            {jobs.length > 0 && (
                <div className="w-full bg-white border border-[#E7E7E5] rounded-xl overflow-hidden shadow-sm mb-6">
                    {/* Table Header */}
                    <div className="grid grid-cols-[1fr_1fr_150px_180px] items-center px-5 py-2 border-b border-[#E7E7E5] bg-[#FAFAF9]">
                        <span className="text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            Unternehmen
                        </span>
                        <span className="text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            Job
                        </span>
                        <span className="text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            Anzahl Interviews
                        </span>
                        <span />
                    </div>

                    {/* Table Rows */}
                    {jobs.map((job) => {
                        const sessions = getJobSessions(job.id);
                        const isExpanded = expandedJobId === job.id;
                        const bestScore = sessions.reduce(
                            (max, s) => s.coaching_score && s.coaching_score > max ? s.coaching_score : max,
                            0
                        );
                        const completedForJob = sessions.filter(s => s.session_status === 'completed');

                        return (
                            <div key={job.id} className="border-b border-[#E7E7E5] last:border-b-0">
                                {/* Main Row — clicking row only expands past sessions, never opens modal */}
                                <div
                                    className={`grid grid-cols-[1fr_1fr_150px_180px] items-center px-5 py-3 transition-colors group ${completedForJob.length > 0 ? 'cursor-pointer hover:bg-[#FAFAF9]' : ''
                                        }`}
                                    onClick={completedForJob.length > 0
                                        ? () => setExpandedJobId(isExpanded ? null : job.id)
                                        : undefined
                                    }
                                >
                                    {/* Col 1: Unternehmen — click opens Steckbrief */}
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {completedForJob.length > 0 ? (
                                            <motion.div
                                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                                transition={{ duration: 0.15 }}
                                                className="shrink-0"
                                            >
                                                <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                                            </motion.div>
                                        ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-transparent" />
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSteckbriefExpandedId(steckbriefExpandedId === job.id ? null : job.id);
                                            }}
                                            className="text-sm font-medium text-[#37352F] truncate hover:text-[#2B5EA7] hover:underline text-left transition-colors"
                                        >
                                            {job.company_name}
                                        </button>
                                    </div>

                                    {/* Col 2: Job */}
                                    <span className="text-sm text-[#73726E] truncate">
                                        {job.job_title.split(' ').slice(0, 4).join(' ')}
                                    </span>

                                    {/* Col 3: Interviews */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-[#37352F]">
                                            {completedForJob.length > 0 ? `${completedForJob.length}x` : '—'}
                                        </span>
                                        {bestScore > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: BLUE_LIGHT, color: BLUE }}>
                                                <Star className="h-2.5 w-2.5" />
                                                {bestScore}/10
                                            </span>
                                        )}
                                    </div>

                                    {/* Col 4: Action Button — ONLY this triggers the modal */}
                                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                                        <motion.button
                                            whileTap={{ scale: 0.97 }}
                                            onClick={() => openModal(job)}
                                            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all border-2 hover:text-white"
                                            style={{
                                                borderColor: BLUE,
                                                color: BLUE,
                                                background: 'transparent',
                                            }}
                                            onMouseEnter={(e) => {
                                                (e.currentTarget as HTMLButtonElement).style.background = BLUE;
                                                (e.currentTarget as HTMLButtonElement).style.color = 'white';
                                            }}
                                            onMouseLeave={(e) => {
                                                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                                (e.currentTarget as HTMLButtonElement).style.color = BLUE;
                                            }}
                                        >
                                            Interview beginnen
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Steckbrief Inline Expand */}
                                <AnimatePresence>
                                    {steckbriefExpandedId === job.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.18 }}
                                            className="overflow-hidden border-t border-[#E7E7E5]"
                                        >
                                            <div className="px-5 py-4 bg-[#FAFAF9]/50 space-y-3">
                                                {/* Summary */}
                                                {job.summary && (
                                                    <p className="text-xs text-[#37352F] leading-relaxed">{job.summary}</p>
                                                )}

                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* Aufgaben */}
                                                    {job.responsibilities && job.responsibilities.length > 0 && (
                                                        <div>
                                                            <h5 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Aufgaben</h5>
                                                            <ul className="space-y-1">
                                                                {job.responsibilities.slice(0, 4).map((item, i) => (
                                                                    <li key={i} className="text-xs text-[#37352F] flex gap-1.5 items-start leading-snug">
                                                                        <span className="text-slate-400 mt-px shrink-0 text-[10px]">•</span>
                                                                        <span>{item}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Qualifikationen */}
                                                    {job.qualifications && job.qualifications.length > 0 && (
                                                        <div>
                                                            <h5 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Qualifikationen</h5>
                                                            <ul className="space-y-1">
                                                                {job.qualifications.slice(0, 4).map((item, i) => (
                                                                    <li key={i} className="text-xs text-[#37352F] flex gap-1.5 items-start leading-snug">
                                                                        <span className="text-slate-400 mt-px shrink-0 text-[10px]">•</span>
                                                                        <span>{item}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ATS Keywords */}
                                                {job.buzzwords && job.buzzwords.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {job.buzzwords.slice(0, 8).map((kw, i) => (
                                                            <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                                {kw}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Source URL */}
                                                {job.source_url && (
                                                    <a
                                                        href={job.source_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-[#2B5EA7] hover:underline"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Originalanzeige
                                                    </a>
                                                )}

                                                {/* Empty state */}
                                                {!job.summary && !job.responsibilities?.length && !job.qualifications?.length && (
                                                    <p className="text-xs text-slate-400">Kein Steckbrief vorhanden.</p>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Expanded: Past Sessions for this Job */}
                                <AnimatePresence>
                                    {isExpanded && completedForJob.length > 0 && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.18 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-6 pb-3 pt-1 border-t border-[#E7E7E5]">
                                                <p className="text-[10px] font-medium text-[#A8A29E] uppercase tracking-wider mb-2 pt-1.5">
                                                    Abgeschlossene Sessions
                                                </p>
                                                <div className="space-y-1">
                                                    {completedForJob.map((session) => (
                                                        <div
                                                            key={session.id}
                                                            onClick={() => router.push(`/dashboard/coaching/${session.id}/analysis`)}
                                                            className="flex items-center justify-between pl-4 pr-2 py-2 hover:bg-[#F7F6F3] transition-colors rounded-lg cursor-pointer group/row"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                                                                <span className="text-sm text-[#37352F]">
                                                                    {new Date(session.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                                </span>
                                                                <span className="text-xs text-[#A8A29E]">
                                                                    {session.turn_count} Fragen
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {session.coaching_score && (
                                                                    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: BLUE }}>
                                                                        <Star className="h-3 w-3" />
                                                                        {session.coaching_score}/10
                                                                    </span>
                                                                )}
                                                                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover/row:opacity-100 transition-opacity" style={{ color: MUTED }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
