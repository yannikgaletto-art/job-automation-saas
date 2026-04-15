'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Clock, Loader2, Building2, BriefcaseBusiness, PlayCircle, ExternalLink, FileText, BookOpen, GraduationCap, Trash2, CheckCircle2 } from 'lucide-react';
import { DocumentsRequiredDialog } from '@/components/shared/documents-required-dialog';
import { CertificateCompactList } from '@/components/certificates/certificate-compact-list';
import { GuidedTourOverlay } from '@/components/dashboard/guided-tour-overlay';
import { useDashboardTour, type TourStep } from '../hooks/useDashboardTour';
import { AiGeneratedBadge } from '@/components/ui/ai-generated-badge';

const BLUE = '#2B5EA7';
const BLUE_LIGHT = '#E8EFF8';
const TEXT = '#37352F';

// --- CancelButton for the interview-creation modal ---
// Appears after 15s so the user is never stuck if the API hangs.
function ModalCancelButton({ onCancel }: { onCancel: () => void }) {
    const [visible, setVisible] = useState(false);
    const t = useTranslations('dashboard.coaching');
    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 15000);
        return () => clearTimeout(timer);
    }, []);
    if (!visible) return null;
    return (
        <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors mt-4"
        >
            {t('cancel')}
        </motion.button>
    );
}
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

type InterviewRound = 'kennenlernen' | 'deep_dive' | 'case_study';

const ROUND_OPTIONS: { value: InterviewRound; key: string; descKey: string }[] = [
    { value: 'kennenlernen', key: 'round_kennenlernen', descKey: 'round_kennenlernen_desc' },
    { value: 'deep_dive', key: 'round_deep_dive', descKey: 'round_deep_dive_desc' },
    { value: 'case_study', key: 'round_case_study', descKey: 'round_case_study_desc' },
];

const PROGRESS_STEPS_KEYS = [
    'progress_cv',
    'progress_job',
    'progress_gap',
    'progress_prepare',
    'progress_question',
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
    feedback_report?: string | null;
}

export default function CoachingPage() {
    const router = useRouter();
    const t = useTranslations('dashboard.coaching');
    const locale = useLocale();
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
    const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

    // ─── Tour Setup (two-branch: empty vs. full) ──────────────────────
    const [tourReady, setTourReady] = useState(false);

    const EMPTY_STEPS: TourStep[] = [
        {
            targetSelector: '[data-tour="coaching-empty-btn"]',
            position: 'bottom',
            titleKey: 'coaching.empty_step1_title',
            bodyKey: 'coaching.empty_step1_body',
        },
    ];

    const FULL_STEPS: TourStep[] = [
        {
            targetSelector: '[data-tour="coaching-start-btn"]',
            position: 'left',
            titleKey: 'coaching.step1_title',
            bodyKey: 'coaching.step1_body',
        },
        {
            targetSelector: '[data-tour="coaching-expanded-row"]',
            position: 'top',
            titleKey: 'coaching.step2_title',
            bodyKey: 'coaching.step2_body',
        },
    ];

    const tourSteps = !tourReady ? [] : (jobs.length === 0 ? EMPTY_STEPS : FULL_STEPS);

    const tour = useDashboardTour('coaching', tourSteps, {
        delayMs: 2000,
        enabled: tourReady,
    });

    const handleTourNext = useCallback(() => tour.nextStep(), [tour]);
    const handleTourSkip = useCallback(() => tour.skipTour(), [tour]);

    // Tour: auto-expand first job when reaching step 2 (expanded row)
    useEffect(() => {
        if (!tour.isActive) return;
        if (jobs.length === 0) return;

        if (tour.currentStep === 0) {
            // Step 1: highlight start-btn, keep rows collapsed
            setExpandedJobId(null);
        } else if (tour.currentStep === 1) {
            // Step 2: expand first job to show steckbrief + recommendations
            setExpandedJobId(jobs[0].id);
        }
    }, [tour.isActive, tour.currentStep, jobs]);

    // Delete coaching sessions + job permanently (optimistic)
    const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        // Optimistic: remove from both lists so the row disappears immediately
        setJobs(prev => prev.filter(j => j.id !== jobId));
        setPastSessions(prev => prev.filter(s => s.job_id !== jobId));
        // If this was the active job, clear active session banner
        if (activeJobId === jobId) {
            setActiveSessionId(null);
            setActiveJobId(null);
        }
        try {
            // Run both deletes in parallel: coaching sessions + job_queue entry
            await Promise.all([
                fetch(`/api/coaching/sessions?jobId=${jobId}`, { method: 'DELETE' }),
                fetch('/api/jobs/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId }),
                }),
            ]);
        } catch { /* silent — optimistic update already applied */ }
    };


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
            setTourReady(true);
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
        const totalSteps = PROGRESS_STEPS_KEYS.length;
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
                throw new Error(data.error || 'Error');
            }

            const data = await res.json();
            await new Promise((r) => setTimeout(r, 500));
            router.push(`/dashboard/coaching/${data.sessionId}`);
        } catch (err) {
            clearInterval(stepInterval);
            console.error('[Coaching] Session creation failed:', err);
            alert(t('modal_error'));
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
                {t('title')}
            </motion.h1>
            <p className="text-sm mb-8" style={{ color: MUTED }}>
                {t('subtitle')} <AiGeneratedBadge variant="coach" />
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
                            {t('active_session')}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                            {jobs.find(j => j.id === activeJobId)?.company_name || t('active_in_progress')} — {t('active_click_continue')}
                        </p>
                    </div>
                    <button
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: BLUE }}
                    >
                        {t('continue')}
                    </button>
                </motion.div>
            )}

            {/* ─── Empty State ─────────────────────────────────────────── */}
            {jobs.length === 0 && (
                <div className="py-4">
                    <p style={{ color: TEXT }}>{t('empty_no_jobs')}</p>
                    <p className="text-sm mt-1" style={{ color: MUTED }}>
                        {t('empty_add_first')}
                    </p>
                    <motion.button
                        data-tour="coaching-empty-btn"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => router.push('/dashboard/job-search')}
                        className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold transition-all border-2 hover:text-white"
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
                        {t('empty_start_search')}
                    </motion.button>
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
                            {/* ── Creating (Progress) — CV Match Design ── */}
                            {modalStep === 'creating' && (
                                <div className="w-full">
                                    {/* Header */}
                                    <div className="flex items-center gap-2.5 mb-1">
                                        <Loader2 className="w-5 h-5 text-[#002e7a] animate-spin shrink-0" />
                                        <span className="text-sm font-semibold text-[#37352F]">
                                            {t('modal_creating_title')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#73726E] mb-5 pl-[29px]">{t('modal_creating_time')}</p>

                                    {/* Step list */}
                                    <div className="space-y-2">
                                        {PROGRESS_STEPS_KEYS.map((key, i) => {
                                            const isDone = i < currentProgressStep;
                                            const isActive = i === currentProgressStep;
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
                                                        {t(key as Parameters<typeof t>[0])}
                                                    </span>

                                                    {/* Static grey dot for active step */}
                                                    {isActive && (
                                                        <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    {/* Cancel — visible after 15s. Navigates back, not just closes modal. */}
                                    <div className="mt-1 pl-1">
                                        <ModalCancelButton onCancel={closeModal} />
                                    </div>
                                </div>
                            )}

                            {/* ── CV Selection ── */}
                            {modalStep === 'cv' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        {t('modal_cv_title')}
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} {t('modal_cv_at')} {selectedJob.company_name}
                                    </p>
                                    {loadingCvs ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin" style={{ color: BLUE }} />
                                        </div>
                                    ) : (
                                        <>
                                            <label className="text-xs font-medium block mb-3" style={{ color: TEXT }}>
                                                {t('modal_cv_which')}
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
                                                                {t('modal_cv_uploaded', { date: new Date(cv.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'de-DE') })}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={closeModal} className="flex-1 py-2.5 text-sm transition-colors" style={{ color: MUTED }}>
                                                    {t('cancel')}
                                                </button>
                                                <button
                                                    onClick={() => setModalStep('round')}
                                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                                                    style={{ background: BLUE }}
                                                >
                                                    {t('next')}
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
                                        {t('modal_round_title')}
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} {t('modal_cv_at')} {selectedJob.company_name}
                                    </p>
                                    <label className="text-xs font-medium block mb-3" style={{ color: TEXT }}>
                                        {t('modal_round_label')}
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
                                                    {t(opt.key as Parameters<typeof t>[0])}
                                                </span>
                                                <p className="text-xs mt-0.5" style={{ color: MUTED }}>{t(opt.descKey as Parameters<typeof t>[0])}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={closeModal} className="flex-1 py-2.5 text-sm transition-colors" style={{ color: MUTED }}>
                                            {t('cancel')}
                                        </button>
                                        <button
                                            onClick={() => setModalStep('questions')}
                                            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                                            style={{ background: BLUE }}
                                        >
                                            {t('next')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Question Count ── */}
                            {modalStep === 'questions' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: TEXT }}>
                                        {t('modal_round_title')}
                                    </h3>
                                    <p className="text-sm mb-5" style={{ color: MUTED }}>
                                        {selectedJob.job_title} {t('modal_cv_at')} {selectedJob.company_name}
                                    </p>
                                    <label className="text-xs font-medium block mb-3" style={{ color: TEXT }}>
                                        {t('modal_questions_label')}
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
                                            {t('back')}
                                        </button>
                                        <button
                                            onClick={startSession}
                                            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                                            style={{ background: BLUE }}
                                        >
                                            {t('modal_start')}
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
                            {t('table_company')}
                        </span>
                        <span className="text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            Job
                        </span>
                        <span className="text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            {t('table_interviews')}
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
                                <div
                                    className={`grid grid-cols-[1fr_1fr_150px_auto] items-center px-5 py-3 transition-colors group cursor-pointer hover:bg-[#FAFAF9]`}
                                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                                >
                                    {/* Col 1: Unternehmen — click opens Steckbrief */}
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <motion.div
                                            animate={{ rotate: isExpanded ? 90 : 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="shrink-0"
                                        >
                                            <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                                        </motion.div>
                                        <span
                                            className="text-sm font-medium text-[#37352F] truncate text-left"
                                        >
                                            {job.company_name}
                                        </span>
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
                                    </div>

                                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={(e) => handleDeleteJob(job.id, e)}
                                            className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all text-[#A8A29E] hover:text-red-500 hover:bg-red-50"
                                            title={t('table_delete_title')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <motion.button
                                            data-tour={job.id === jobs[0]?.id ? 'coaching-start-btn' : undefined}
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
                                            {t('start_interview')}
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Expanded: Past Sessions for this Job */}
                                <AnimatePresence>
                                    {isExpanded && (() => {
                                        // Extract topic suggestions from the latest completed session with a report
                                        const latestWithReport = completedForJob.find(s => s.feedback_report);
                                        let topics: { topic: string; searchQuery: string; youtubeTitle: string; context?: string[]; category?: string }[] = [];
                                        if (latestWithReport?.feedback_report) {
                                            try {
                                                const report = JSON.parse(latestWithReport.feedback_report);
                                                if (report.topicSuggestions && Array.isArray(report.topicSuggestions)) {
                                                    topics = report.topicSuggestions.map((t: string | { topic: string; searchQuery?: string; youtubeTitle?: string; context?: string[]; category?: string }) =>
                                                        typeof t === 'string' ? { topic: t, searchQuery: t, youtubeTitle: t } : t
                                                    );
                                                }
                                            } catch { /* ignore parse errors */ }
                                        }

                                        return (
                                            <motion.div
                                                data-tour={job.id === jobs[0]?.id ? 'coaching-expanded-row' : undefined}
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-6 pb-3 pt-1 border-t border-[#E7E7E5]">
                                                    {/* ── Steckbrief ── */}
                                                    <div className="pb-4 space-y-3">
                                                        {job.summary && (
                                                            <p className="text-xs text-[#37352F] leading-relaxed">{job.summary}</p>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-4">
                                                            {job.responsibilities && job.responsibilities.length > 0 && (
                                                                <div>
                                                                    <h5 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{t('steckbrief_tasks')}</h5>
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

                                                            {job.qualifications && job.qualifications.length > 0 && (
                                                                <div>
                                                                    <h5 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{t('steckbrief_qualifications')}</h5>
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

                                                        {job.buzzwords && job.buzzwords.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {job.buzzwords.slice(0, 8).map((kw, i) => (
                                                                    <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                                        {kw}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {job.source_url && (
                                                            <a
                                                                href={job.source_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-xs text-[#2B5EA7] hover:underline"
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                                {t('steckbrief_original')}
                                                            </a>
                                                        )}

                                                        {!job.summary && !job.responsibilities?.length && !job.qualifications?.length && (
                                                            <p className="text-xs text-slate-400">{t('steckbrief_empty')}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mb-3 pt-1.5">
                                                        <BookOpen className="h-3.5 w-3.5" style={{ color: BLUE }} />
                                                        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: BLUE }}>
                                                            {t('recommendations_title')}
                                                        </p>
                                                    </div>
                                                    {topics.length > 0 ? (
                                                        <div className="divide-y" style={{ borderColor: BORDER }}>
                                                            {topics.map((topic, ti) => {
                                                                const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.searchQuery)}`;
                                                                const isOpen = expandedTopics[`${job.id}-${ti}`] || false;
                                                                return (
                                                                    <div key={ti}>
                                                                        {/* Row header — always visible */}
                                                                        <button
                                                                            onClick={() => setExpandedTopics(prev => ({ ...prev, [`${job.id}-${ti}`]: !prev[`${job.id}-${ti}`] }))}
                                                                            className="w-full flex items-center gap-2 py-2.5 text-left transition-colors hover:bg-slate-50/50"
                                                                        >
                                                                            <ChevronRight
                                                                                className="h-3.5 w-3.5 shrink-0 transition-transform"
                                                                                style={{ color: MUTED, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                                                            />
                                                                            <p className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: TEXT }}>
                                                                                {topic.topic}
                                                                            </p>
                                                                            {topic.category && (
                                                                                <span
                                                                                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                                                                                    style={{
                                                                                        background: topic.category === 'rolle' ? '#E8EFF8' : '#F0FDF4',
                                                                                        color: topic.category === 'rolle' ? BLUE : '#15803d',
                                                                                    }}
                                                                                >
                                                                                    {topic.category === 'rolle' ? t('category_role') : t('category_technique')}
                                                                                </span>
                                                                            )}
                                                                            <a
                                                                                href={youtubeUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0 transition-colors hover:opacity-80"
                                                                                style={{ background: '#FF000012', color: '#CC0000' }}
                                                                            >
                                                                                YouTube
                                                                            </a>
                                                                        </button>

                                                                        {/* Expanded context — toggled */}
                                                                        {isOpen && topic.context && topic.context.length > 0 && (
                                                                            <div className="pb-3 pl-6">
                                                                                <ul className="space-y-1">
                                                                                    {topic.context.map((line, ci) => (
                                                                                        <li key={ci} className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: MUTED }}>
                                                                                            <span className="shrink-0 mt-0.5" style={{ color: BLUE }}>•</span>
                                                                                            <span>{line}</span>
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs pl-1" style={{ color: MUTED }}>
                                                            {t('recommendations_empty')}
                                                        </p>
                                                    )}

                                                    {/* ── Weiterbildung & Zertifizierung ── */}
                                                    <div className="mt-4 pt-3 border-t border-[#E7E7E5]">
                                                        <div className="flex items-center gap-1.5 mb-3">
                                                            <GraduationCap className="h-3.5 w-3.5" style={{ color: BLUE }} />
                                                            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: BLUE }}>
                                                                {t('certificate_section')}
                                                            </p>
                                                        </div>
                                                        <CertificateCompactList jobId={job.id} jobStatus={job.status} hasCompletedSession={completedForJob.length > 0} />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })()}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Coaching Guided Tour */}
            {tour.isActive && tour.step && (
                <GuidedTourOverlay
                    step={tour.step}
                    currentStep={tour.currentStep}
                    totalSteps={tour.totalSteps}
                    onNext={handleTourNext}
                    onSkip={handleTourSkip}
                />
            )}
        </div>
    );
}
