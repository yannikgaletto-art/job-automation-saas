'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { ExternalLink, CheckCircle2, XIcon, X, Briefcase, Euro, MapPin, ArrowRight, BriefcaseBusiness, Globe } from 'lucide-react';

import { useJobQueueCount } from '@/store/use-job-queue-count';
import { useTranslations } from 'next-intl';

// ─── Filter label lookup (mirrors i18n keys in locale files) ────────
// Keeping this as a static map avoids prop-drilling t() through 3 layers.
// Keys match WERTE_FILTER_KEYS in page.tsx and i18n keys filter_wert_*.
const WERTE_FILTER_KEYS = [
    'nachhaltigkeit', 'innovation', 'social_impact', 'deep_tech',
    'dei', 'gemeinwohl', 'circular_economy', 'new_work',
] as const;

// ─── Types ────────────────────────────────────────────────────────

interface SwipeJob {
    title: string;
    company_name: string;
    thumbnail?: string;
    location: string;
    description: string;
    apply_link: string;
    detected_extensions: {
        posted_at?: string;
        schedule_type?: string;
        salary?: string;
        work_from_home?: boolean;
    };
    already_in_queue?: boolean;
    matched_filters?: string[];
    raw?: Record<string, unknown>;
}

interface JobSwipeViewProps {
    jobs: SwipeJob[];
}


// ─── Company Initial Avatar ──────────────────────────────────────

const AVATAR_COLORS = [
    '#002e7a', '#0B6E4F', '#6B21A8', '#C2410C', '#0369A1',
    '#9333EA', '#059669', '#D97706', '#DC2626', '#2563EB',
];

function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}


// ─── Swipe Card ──────────────────────────────────────────────────


function SwipeCard({
    job,
    isTop,
    addingToQueue,
    onSwipe,
    t,
}: {
    job: SwipeJob;
    isTop: boolean;
    addingToQueue: boolean;
    onSwipe: (direction: 'left' | 'right') => void;
    t: ReturnType<typeof useTranslations>;
}) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);
    const opacity = useTransform(x, [-300, -100, 0, 100, 300], [0.3, 1, 1, 1, 0.3]);

    // Glow overlay colors
    const greenOpacity = useTransform(x, [0, 100, 200], [0, 0.15, 0.4]);
    const redOpacity = useTransform(x, [-200, -100, 0], [0.4, 0.15, 0]);

    const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
        const threshold = 120;
        const velocityThreshold = 500;

        if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
            onSwipe('right');
        } else if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
            onSwipe('left');
        }
    };



    const avatarColor = getAvatarColor(job.company_name);
    const initial = job.company_name.charAt(0).toUpperCase();

    return (
        <motion.div
            className="absolute inset-0"
            style={{
                x: isTop ? x : 0,
                rotate: isTop ? rotate : 0,
                opacity: isTop ? opacity : 1,
                zIndex: isTop ? 10 : 1,
                scale: isTop ? 1 : 0.95,
            }}
            drag={isTop ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.8}
            onDragEnd={isTop ? handleDragEnd : undefined}
            initial={false}
        >
            {/* Swipe glow overlays */}
            {isTop && (
                <>
                    <motion.div
                        className="absolute inset-0 rounded-2xl bg-emerald-400 pointer-events-none z-20"
                        style={{ opacity: greenOpacity }}
                    />
                    <motion.div
                        className="absolute inset-0 rounded-2xl bg-red-400 pointer-events-none z-20"
                        style={{ opacity: redOpacity }}
                    />
                </>
            )}

            <div className="h-full bg-white rounded-2xl border border-[#E7E7E5] shadow-lg overflow-hidden flex flex-col relative z-10">
                {/* Card Header — Logo + Company + Title */}
                <div className="p-6 pb-4">
                    <div className="flex items-center gap-3 mb-4">
                        {job.thumbnail ? (
                            <img
                                src={job.thumbnail}
                                alt={job.company_name}
                                className="w-12 h-12 rounded-xl object-contain bg-[#F7F7F5] border border-[#E7E7E5] p-1"
                            />
                        ) : (
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                style={{ backgroundColor: avatarColor }}
                            >
                                {initial}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-[#37352F] truncate">
                                    {job.company_name}
                                </p>
                                {job.already_in_queue && (
                                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                                        <CheckCircle2 className="w-3 h-3" />
                                        {t('swipe_in_queue')}
                                    </span>
                                )}
                            </div>
                            {job.detected_extensions?.posted_at && (
                                <p className="text-[10px] text-[#A8A29E]">
                                    {job.detected_extensions.posted_at}
                                </p>
                            )}
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-[#37352F] leading-tight mb-3">
                        {job.title}
                    </h3>

                    {/* Separator */}
                    <div className="w-full h-px bg-[#E7E7E5]" />
                </div>

                {/* Steckbrief — compact metadata rows */}
                <div className="px-6 space-y-2.5 flex-1">
                    {/* Schedule type — SerpAPI returns in user's hl language */}
                    {job.detected_extensions?.schedule_type && (
                        <div className="flex items-center gap-2.5">
                            <Briefcase className="w-4 h-4 text-[#A8A29E] shrink-0" />
                            <span className="text-sm text-[#37352F]">
                                {job.detected_extensions.schedule_type}
                            </span>
                        </div>
                    )}

                    {/* Salary */}
                    {job.detected_extensions?.salary && (
                        <div className="flex items-center gap-2.5">
                            <Euro className="w-4 h-4 text-[#A8A29E] shrink-0" />
                            <span className="text-sm text-[#37352F]">
                                {job.detected_extensions.salary}
                            </span>
                        </div>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-2.5">
                        <MapPin className="w-4 h-4 text-[#A8A29E] shrink-0" />
                        <span className="text-sm text-[#37352F]">{job.location}</span>
                        {job.detected_extensions?.work_from_home && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0f4ff] text-[#002e7a] border border-[#002e7a]/10">
                                {t('remote_badge')}
                            </span>
                        )}
                    </div>

                    {/* Matched filters — translated via i18n */}
                    {job.matched_filters && job.matched_filters.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {job.matched_filters.map(f => (
                                <span
                                    key={f}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                                >
                                    {WERTE_FILTER_KEYS.includes(f as any) ? t(`filter_wert_${f}`) : f}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Description — formatted as bullet list (matches List view) */}
                    {job.description && (
                        <div className="pt-2">
                            <p className="text-[10px] text-[#A8A29E] uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {t('desc_original_lang')}
                            </p>
                            <ul className="space-y-0.5">
                                {job.description
                                    .split(/(?<=[.!?])\s+/)
                                    .filter((s: string) => s.trim().length > 15)
                                    .slice(0, 3)
                                    .map((sentence: string, i: number) => (
                                        <li key={i} className="flex items-start gap-1.5 text-xs text-[#73726E] leading-relaxed">
                                            <span className="w-1 h-1 rounded-full bg-[#002e7a] mt-1.5 shrink-0 opacity-40" />
                                            <span className="line-clamp-1">{sentence.trim()}</span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="p-6 pt-4 mt-auto">
                    {/* Website link */}
                    {job.apply_link && (
                        <a
                            href={job.apply_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 text-xs text-[#73726E] hover:text-[#002e7a] transition-colors mb-3"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {t('swipe_view_website')}
                        </a>
                    )}

                    {/* Swipe buttons */}
                    {isTop && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => onSwipe('left')}
                                disabled={addingToQueue}
                                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-red-200 text-red-500 font-medium text-sm hover:bg-red-50 hover:border-red-300 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <XIcon className="w-5 h-5" />
                                {t('swipe_skip')}
                            </button>
                            {job.already_in_queue ? (
                                <div className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-green-50 text-green-700 font-medium text-sm border-2 border-green-200">
                                    <CheckCircle2 className="w-5 h-5" />
                                    {t('swipe_already_in_queue')}
                                </div>
                            ) : (
                                <button
                                    onClick={() => onSwipe('right')}
                                    disabled={addingToQueue}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#002e7a] text-white font-medium text-sm transition-all active:scale-95 shadow-md hover:shadow-lg relative overflow-hidden disabled:cursor-not-allowed"
                                >
                                    {/* Progress bar fill animation */}
                                    {addingToQueue && (
                                        <motion.div
                                            className="absolute inset-0 bg-[#0050d4]"
                                            initial={{ x: '-100%' }}
                                            animate={{ x: '0%' }}
                                            transition={{ duration: 3, ease: 'easeInOut' }}
                                        />
                                    )}
                                    <span className={`relative z-10 flex items-center gap-2 transition-opacity ${addingToQueue ? 'opacity-80' : ''}`}>
                                        <CheckCircle2 className="w-5 h-5" />
                                        {addingToQueue ? t('swipe_adding') : t('swipe_to_queue')}
                                    </span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Queue Full Modal (Swipe) ─────────────────────────────────────

function SwipeQueueFullModal({ onClose, t }: { onClose: () => void; t: ReturnType<typeof useTranslations> }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 12 }}
                transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative"
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-[#A8A29E] hover:text-[#37352F] hover:bg-[#F7F7F5] transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
                    <BriefcaseBusiness className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-[#37352F] mb-1.5">{t('queue_full_title')}</h3>
                <p className="text-sm text-[#73726E] leading-relaxed mb-5">
                    {t('queue_full_body')}
                </p>
                <div className="flex flex-col gap-2">
                    <a
                        href="/dashboard/job-queue"
                        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[#002e7a] text-white text-sm font-semibold hover:bg-[#001f5c] transition-colors"
                    >
                        <ArrowRight className="w-4 h-4" />
                        {t('swipe_go_to_queue')}
                    </a>
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 px-4 rounded-xl border border-[#E7E7E5] text-sm text-[#73726E] font-medium hover:bg-[#F7F7F5] transition-colors"
                    >
                        {t('queue_full_close')}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Main Swipe View ─────────────────────────────────────────────

export default function JobSwipeView({ jobs }: JobSwipeViewProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [addingToQueue, setAddingToQueue] = useState(false);
    const [swipedJobs, setSwipedJobs] = useState<Set<string>>(new Set());
    const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
    const [showQueueFull, setShowQueueFull] = useState(false);
    const { increment } = useJobQueueCount();
    const dwellStartRef = useRef<number>(Date.now());
    const t = useTranslations('dashboard.job_search');

    // Reset dwell timer when card changes
    useEffect(() => {
        dwellStartRef.current = Date.now();
    }, [currentIndex]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (currentIndex >= jobs.length) return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handleSwipe('left');
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleSwipe('right');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, jobs.length]);

    const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
        if (currentIndex >= jobs.length || addingToQueue) return;

        const job = jobs[currentIndex];
        const dwellTimeMs = Date.now() - dwellStartRef.current;

        // Log telemetry to localStorage for future ML use
        try {
            const logs = JSON.parse(localStorage.getItem('pathly_swipe_telemetry') || '[]');
            logs.push({
                job_url: job.apply_link,
                company: job.company_name,
                title: job.title,
                action: direction === 'right' ? 'like' : 'skip',
                dwell_time_ms: dwellTimeMs,
                salary: job.detected_extensions?.salary || null,
                location: job.location,
                schedule: job.detected_extensions?.schedule_type || null,
                timestamp: new Date().toISOString(),
            });
            // Keep last 200 entries
            localStorage.setItem('pathly_swipe_telemetry', JSON.stringify(logs.slice(-200)));
        } catch { /* localStorage full or disabled — silently ignore */ }

        if (direction === 'right' && !job.already_in_queue) {
            setAddingToQueue(true);
            try {
                const res = await fetch('/api/jobs/search/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        serpApiJob: {
                            title: job.title,
                            company_name: job.company_name,
                            location: job.location,
                            description: job.description || 'Keine Beschreibung verfügbar',
                            apply_link: job.apply_link,
                            detected_extensions: job.detected_extensions || {},
                            raw: job.raw || {},
                        },
                        searchQuery: job.title,
                    }),
                });

                if (res.status === 429) {
                    setShowQueueFull(true);
                    setAddingToQueue(false);
                    return;
                }

                if (res.ok) {
                    const data = await res.json();
                    if (!data.duplicate) {
                        // §12.5: Swipe skips SteckbriefPreview → auto-confirm
                        // Transitions pending_review → pending so job appears in Queue
                        if (data.job?.id) {
                            try {
                                await fetch('/api/jobs/confirm', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ jobId: data.job.id }),
                                });
                            } catch (confirmErr) {
                                console.warn('[SwipeView] Auto-confirm failed:', confirmErr);
                            }
                        }
                        increment();
                    }
                } else {
                    console.error('[SwipeView] Failed to add job to queue:', res.status, await res.text().catch(() => ''));
                }
            } catch (err) {
                console.error('[SwipeView] Network error adding to queue:', err);
            } finally {
                setAddingToQueue(false);
            }
        }

        setExitDirection(direction);
        setSwipedJobs(prev => new Set(prev).add(job.apply_link));

        // Wait for exit animation
        setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
            setExitDirection(null);
        }, 300);
    }, [currentIndex, jobs, addingToQueue, increment]);

    // All done state
    if (currentIndex >= jobs.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 10 }}
                    className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4"
                >
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h3 className="text-lg font-bold text-[#37352F] mb-1">{t('swipe_all_seen')}</h3>
                <p className="text-sm text-[#73726E] mb-1">
                    {t('swipe_jobs_reviewed', { count: swipedJobs.size })}
                </p>
                <p className="text-xs text-[#A8A29E]">
                    {t('swipe_new_search_hint')}
                </p>
            </div>
        );
    }

    const currentJob = jobs[currentIndex];
    const nextJob = currentIndex + 1 < jobs.length ? jobs[currentIndex + 1] : null;

    return (
        <>
            <AnimatePresence>
                {showQueueFull && <SwipeQueueFullModal onClose={() => setShowQueueFull(false)} t={t} />}
            </AnimatePresence>
            <div className="flex flex-col items-center">
                {/* Progress counter */}
                <div className="flex items-center gap-2 mb-4 w-full max-w-[380px]">
                    <div className="flex-1 h-1.5 rounded-full bg-[#F0F0EE] overflow-hidden">
                        <motion.div
                            className="h-full rounded-full bg-[#002e7a]"
                            initial={false}
                            animate={{ width: `${((currentIndex) / jobs.length) * 100}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                    <span className="text-xs text-[#73726E] font-medium tabular-nums shrink-0">
                        {currentIndex + 1} / {jobs.length}
                    </span>
                </div>

                {/* Card stack */}
                <div className="relative w-full max-w-[380px] h-[520px]">
                    <AnimatePresence mode="popLayout">
                        {/* Background card (next) */}
                        {nextJob && !exitDirection && (
                            <motion.div
                                key={`bg-${currentIndex + 1}`}
                                className="absolute inset-x-3 top-2 bottom-0"
                                initial={{ opacity: 0.6 }}
                                animate={{ opacity: 0.6 }}
                            >
                                <div className="h-full bg-white rounded-2xl border border-[#E7E7E5] shadow-sm" />
                            </motion.div>
                        )}

                        {/* Top card */}
                        {!exitDirection && (
                            <motion.div
                                key={`card-${currentIndex}`}
                                className="absolute inset-0"
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.25 }}
                            >
                                <SwipeCard
                                    job={currentJob}
                                    isTop={true}
                                    addingToQueue={addingToQueue}
                                    onSwipe={handleSwipe}
                                    t={t}
                                />
                            </motion.div>
                        )}

                        {/* Exit animation */}
                        {exitDirection && (
                            <motion.div
                                key={`exit-${currentIndex}`}
                                className="absolute inset-0"
                                initial={{ x: 0, rotate: 0, opacity: 1 }}
                                animate={{
                                    x: exitDirection === 'right' ? 500 : -500,
                                    rotate: exitDirection === 'right' ? 20 : -20,
                                    opacity: 0,
                                }}
                                transition={{ duration: 0.3 }}
                            >
                                <SwipeCard
                                    job={currentJob}
                                    isTop={false}
                                    addingToQueue={false}
                                    onSwipe={() => { }}
                                    t={t}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Keyboard hint */}
                <div className="flex items-center gap-4 mt-4 text-[10px] text-[#A8A29E]">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded border border-[#E7E7E5] bg-[#F7F7F5] text-[10px] font-mono">←</kbd>
                        {t('swipe_skip')}
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded border border-[#E7E7E5] bg-[#F7F7F5] text-[10px] font-mono">→</kbd>
                        {t('swipe_to_queue')}
                    </span>
                </div>
            </div>
        </>
    );
}
