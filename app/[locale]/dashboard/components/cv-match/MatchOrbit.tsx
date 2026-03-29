"use client";

/**
 * MatchOrbit — Interactive CV Match Score Visualization (v3)
 *
 * Center: overall match label with 3-phase animation (navy → color → expand)
 * 4 Satellites: Technical, Soft, Experience, Domain — click to expand detail card
 * 1 Summary Satellite: Strengths / Gaps / Potential — click to expand summary card
 *
 * v3 changes:
 * - Much bigger orbit (radius 155, center 110, satellites 72) to fill available space
 * - Full satellite labels (no truncation)
 * - isFromCache controls animation phases correctly
 * - Only lucide-react icons, no emoji
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { ScoreCategory, ScoreLevel } from '@/lib/services/cv-match-analyzer';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Sparkles, ChevronDown } from 'lucide-react';

// --- Types ---

interface SummaryData {
    strengths: string[];
    gaps: string[];
    potentialHighlights: string[];
}

interface MatchOrbitProps {
    overallScore: number;
    breakdown: {
        technicalSkills: ScoreCategory;
        softSkills: ScoreCategory;
        experienceLevel: ScoreCategory;
        domainKnowledge: ScoreCategory;
        languageMatch: ScoreCategory;
    };
    summaryData: SummaryData;
    onCenterClick?: () => void;
    isFromCache?: boolean;
}

interface SatelliteConfig {
    key: string;
    i18nKey: string;
    angle: number;
    data: ScoreCategory;
    isSummary?: boolean;
}

type OrbitPhase = 'initial' | 'colorReveal' | 'expand';

// --- Constants ---

const ORBIT_RADIUS = 155;
const CENTER_SIZE = 110;
const SAT_SIZE = 72;

// --- Helpers ---

export function getMatchFitKey(score: number): 'fit_strong' | 'fit_partial' | 'fit_weak' {
    if (score >= 70) return 'fit_strong';
    if (score >= 50) return 'fit_partial';
    return 'fit_weak';
}

function getFitColor(score: number) {
    if (score >= 70) return {
        bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700',
        glow: 'shadow-[0_0_24px_rgba(34,197,94,0.25)]',
    };
    if (score >= 50) return {
        bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700',
        glow: 'shadow-[0_0_24px_rgba(234,179,8,0.25)]',
    };
    return {
        bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700',
        glow: 'shadow-[0_0_24px_rgba(239,68,68,0.25)]',
    };
}

function getLevelDots(level: ScoreLevel): { filled: number; color: string } {
    switch (level) {
        case 'strong': return { filled: 3, color: 'bg-green-500' };
        case 'solid':  return { filled: 2, color: 'bg-yellow-500' };
        case 'gap':    return { filled: 1, color: 'bg-red-500' };
        default:       return { filled: 2, color: 'bg-yellow-500' };
    }
}

function getLevelKey(level: ScoreLevel): 'level_strong' | 'level_solid' | 'level_gap' {
    switch (level) {
        case 'strong': return 'level_strong';
        case 'solid':  return 'level_solid';
        case 'gap':    return 'level_gap';
        default:       return 'level_solid';
    }
}

function polarToOffset(angleDeg: number, radius: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

/** Bold the first term before a colon/dash for visual hierarchy */
function boldFirst(text: string): React.ReactNode {
    const m = text.match(/^([^:,\-–]+)[:\-–,]\s*(.*)/);
    if (m) return <><strong className="font-semibold text-[#37352F]">{m[1].trim()}</strong>{' — '}{m[2]}</>;
    return text;
}

// --- Level Dots Badge ---

function LevelDotsBadge({ level, t }: { level: ScoreLevel; t: ReturnType<typeof useTranslations> }) {
    const dots = getLevelDots(level);
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
            level === 'strong' ? 'bg-green-50 text-green-700'
                : level === 'solid' ? 'bg-yellow-50 text-yellow-700'
                : 'bg-red-50 text-red-700'
        )}>
            <span className="flex gap-0.5">
                {[0, 1, 2].map(i => (
                    <span key={i} className={cn('w-2 h-2 rounded-full', i < dots.filled ? dots.color : 'bg-slate-200')} />
                ))}
            </span>
            {t(getLevelKey(level))}
        </span>
    );
}

// --- Detail Card (below orbit) ---

function DetailCard({
    config,
    summaryData,
    t,
}: {
    config: SatelliteConfig;
    summaryData: SummaryData;
    t: ReturnType<typeof useTranslations>;
}) {
    const cardRef = useRef<HTMLDivElement>(null);
    const level = (config.data.level ?? 'solid') as ScoreLevel;

    useEffect(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [config.key]);

    if (config.isSummary) {
        const sections = [
            { label: t('strengths'), items: summaryData.strengths, icon: <CheckCircle2 size={14} className="text-green-500" /> },
            { label: t('gaps'), items: summaryData.gaps, icon: <AlertCircle size={14} className="text-red-400" /> },
            { label: t('potential'), items: summaryData.potentialHighlights, icon: <Sparkles size={14} className="text-amber-500" /> },
        ];

        return (
            <motion.div
                ref={cardRef}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
            >
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-4">
                    <h3 className="text-sm font-semibold text-[#37352F] mb-4">
                        {t(config.i18nKey)}
                    </h3>
                    <div className="space-y-5">
                        {sections.map(({ label, items, icon }) => (
                            <div key={label}>
                                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                                    {icon} {label}
                                </p>
                                {items.length > 0 ? (
                                    <ul className="space-y-2 pl-1">
                                        {items.map((item, i) => (
                                            <li key={i} className="text-sm text-[#37352F] flex gap-2.5 items-start leading-relaxed">
                                                <span className="text-slate-300 mt-0.5 shrink-0">•</span>
                                                <span>{boldFirst(item)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-slate-400 italic pl-1">—</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>
        );
    }

    // Standard detail card
    return (
        <motion.div
            ref={cardRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
        >
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        {t(config.i18nKey)}
                    </h3>
                    <LevelDotsBadge level={level} t={t} />
                </div>

                {config.data.reasons.length > 0 ? (
                    <ul className="space-y-2.5 pl-1">
                        {config.data.reasons.map((reason, i) => (
                            <li key={i} className="text-sm text-[#37352F] flex gap-2.5 items-start leading-relaxed">
                                <span className="text-slate-300 mt-0.5 shrink-0">•</span>
                                <span>{boldFirst(reason)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs text-slate-400 italic">—</p>
                )}
            </div>
        </motion.div>
    );
}

// --- Main Orbit Component ---

export function MatchOrbit({ overallScore, breakdown, summaryData, onCenterClick, isFromCache }: MatchOrbitProps) {
    const t = useTranslations('cv_match');
    const prefersReducedMotion = useReducedMotion();
    const [activeSatellite, setActiveSatellite] = useState<string | null>(null);
    const [phase, setPhase] = useState<OrbitPhase>(
        isFromCache || prefersReducedMotion ? 'expand' : 'initial'
    );

    const fitKey = getMatchFitKey(overallScore);
    const fitColor = getFitColor(overallScore);

    // Phase animation timers (only for FRESH analyses, not cached)
    useEffect(() => {
        if (isFromCache || prefersReducedMotion) {
            setPhase('expand');
            return;
        }

        // Phase 1: 2 seconds navy
        const t1 = setTimeout(() => setPhase('colorReveal'), 2000);
        // Phase 2: 0.5s later — satellites fly out
        const t2 = setTimeout(() => setPhase('expand'), 2500);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [isFromCache, prefersReducedMotion]);

    const safe = {
        technicalSkills:  breakdown?.technicalSkills  ?? { level: 'solid' as ScoreLevel, reasons: [] },
        softSkills:       breakdown?.softSkills        ?? { level: 'solid' as ScoreLevel, reasons: [] },
        experienceLevel:  breakdown?.experienceLevel   ?? { level: 'solid' as ScoreLevel, reasons: [] },
        domainKnowledge:  breakdown?.domainKnowledge   ?? { level: 'solid' as ScoreLevel, reasons: [] },
    };

    const summaryLevel: ScoreLevel =
        (summaryData.gaps.length > summaryData.strengths.length) ? 'gap'
            : (summaryData.strengths.length > summaryData.gaps.length) ? 'strong'
            : 'solid';

    const satellites: SatelliteConfig[] = [
        { key: 'technical',  i18nKey: 'breakdown_technical',  angle: -72,  data: safe.technicalSkills  },
        { key: 'soft',       i18nKey: 'breakdown_soft',       angle: 0,    data: safe.softSkills       },
        { key: 'experience', i18nKey: 'breakdown_experience', angle: 72,   data: safe.experienceLevel  },
        { key: 'domain',     i18nKey: 'breakdown_domain',     angle: 144,  data: safe.domainKnowledge  },
        { key: 'summary',    i18nKey: 'breakdown_summary',    angle: -144, data: { level: summaryLevel, reasons: [] }, isSummary: true },
    ];

    const handleSatelliteClick = useCallback((key: string) => {
        setActiveSatellite(prev => (prev === key ? null : key));
    }, []);

    const handleCenterClick = useCallback(() => {
        setActiveSatellite(null);
        onCenterClick?.();
    }, [onCenterClick]);

    const containerSize = (ORBIT_RADIUS + SAT_SIZE) * 2 + 32;

    const centerClasses = phase === 'initial'
        ? 'bg-[#002e7a] border-[#002e7a] text-white shadow-[0_0_28px_rgba(0,46,122,0.4)]'
        : cn(fitColor.bg, fitColor.border, fitColor.text, fitColor.glow);

    return (
        <div className="space-y-0">
            <div
                className="relative mx-auto"
                style={{ width: containerSize, height: containerSize }}
            >
                {/* Decorative orbit ring */}
                <div
                    className="absolute rounded-full border border-dashed border-slate-200 pointer-events-none"
                    style={{
                        width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2,
                        top: '50%', left: '50%',
                        marginTop: -ORBIT_RADIUS, marginLeft: -ORBIT_RADIUS,
                    }}
                />

                {/* Center circle */}
                <motion.button
                    onClick={handleCenterClick}
                    className={cn(
                        'absolute z-10 rounded-full flex flex-col items-center justify-center border-2 cursor-pointer transition-colors duration-700',
                        centerClasses,
                    )}
                    style={{
                        width: CENTER_SIZE, height: CENTER_SIZE,
                        top: '50%', left: '50%',
                        marginTop: -(CENTER_SIZE / 2), marginLeft: -(CENTER_SIZE / 2),
                    }}
                    whileHover={!prefersReducedMotion ? { scale: 1.05 } : {}}
                    whileTap={!prefersReducedMotion ? { scale: 0.97 } : {}}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    aria-label={t(fitKey)}
                >
                    <span className="text-[11px] font-medium opacity-70 leading-none">Match</span>
                    <motion.span
                        className="text-[13px] font-bold leading-tight text-center px-2"
                        key={phase}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        {phase === 'initial' ? t('orbit_loading') : t(fitKey)}
                    </motion.span>
                </motion.button>

                {/* Satellites */}
                {satellites.map((sat, index) => {
                    const offset = polarToOffset(sat.angle, ORBIT_RADIUS);
                    const level = (sat.data.level ?? 'solid') as ScoreLevel;
                    const dots = getLevelDots(level);
                    const isActive = activeSatellite === sat.key;

                    return (
                        <motion.button
                            key={sat.key}
                            className={cn(
                                'absolute z-20 rounded-full flex flex-col items-center justify-center bg-white border cursor-pointer',
                                isActive
                                    ? 'border-[#002e7a] shadow-md ring-2 ring-[#002e7a]/20'
                                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                            )}
                            style={{
                                width: SAT_SIZE, height: SAT_SIZE,
                                top: '50%', left: '50%',
                                marginTop: -(SAT_SIZE / 2), marginLeft: -(SAT_SIZE / 2),
                            }}
                            initial={prefersReducedMotion
                                ? { x: offset.x, y: offset.y, opacity: 1, scale: 1 }
                                : { x: 0, y: 0, opacity: 0, scale: 0 }
                            }
                            animate={phase === 'expand'
                                ? { x: offset.x, y: offset.y, opacity: 1, scale: isActive ? 1.12 : 1 }
                                : { x: 0, y: 0, opacity: 0, scale: 0 }
                            }
                            transition={
                                prefersReducedMotion
                                    ? { duration: 0 }
                                    : {
                                        type: 'spring',
                                        stiffness: 400,
                                        damping: 25,
                                        delay: phase === 'expand' ? 0.1 + index * 0.1 : 0,
                                    }
                            }
                            whileHover={!prefersReducedMotion ? { scale: isActive ? 1.12 : 1.08 } : {}}
                            whileTap={!prefersReducedMotion ? { scale: 0.95 } : {}}
                            onClick={() => handleSatelliteClick(sat.key)}
                            aria-label={t(sat.i18nKey)}
                            aria-pressed={isActive}
                        >
                            <span className="text-[10px] font-medium text-[#37352F] leading-tight text-center px-1 max-w-[64px]">
                                {t(sat.i18nKey)}
                            </span>
                            <span className="flex gap-0.5 mt-0.5">
                                {[0, 1, 2].map(i => (
                                    <span
                                        key={i}
                                        className={cn('w-2 h-2 rounded-full', i < dots.filled ? dots.color : 'bg-slate-200')}
                                    />
                                ))}
                            </span>
                        </motion.button>
                    );
                })}
            </div>

            {/* Detail Card — below orbit */}
            <AnimatePresence mode="wait">
                {activeSatellite && (
                    <DetailCard
                        key={activeSatellite}
                        config={satellites.find(s => s.key === activeSatellite)!}
                        summaryData={summaryData}
                        t={t}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
