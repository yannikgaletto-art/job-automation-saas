"use client";

/**
 * MatchOrbit — Interactive CV Match Score Visualization (v5 — Steckbrief Cards)
 *
 * Layout: Side-by-Side (Orbit LEFT | Steckbrief Card Stack RIGHT)
 * Center: 3-phase animation (navy → color-reveal → expand)
 * 4 Satellites: Technical, Soft, Experience, Domain
 * 1 Summary Satellite: Strengths / Gaps / Potential
 *
 * v5 changes:
 * - Right panel now shows Steckbrief cards (not simple text lists)
 * - Center click = ALL cards, satellite click = filtered by orbitCategory
 * - Cards have chips, context, gaps sections matching the UI mockup
 * - V1 backward compat: old cached data (no _schemaVersion) auto-mapped to cards
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { ScoreCategory, ScoreLevel, RequirementRow, OrbitCategory } from '@/lib/services/cv-match-analyzer';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Sparkles, Settings2 } from 'lucide-react';

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
    overallRecommendation?: string;
    requirementRows: RequirementRow[];
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

const ORBIT_RADIUS = 175;
const CENTER_SIZE = 110;
const SAT_SIZE = 90;

// --- Helpers ---

export function getMatchFitKey(score: number): 'fit_strong' | 'fit_partial' | 'fit_weak' {
    if (score >= 70) return 'fit_strong';
    if (score >= 50) return 'fit_partial';
    return 'fit_weak';
}

function getFitColor(score: number) {
    if (score >= 70) return {
        bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700',
        glow: 'shadow-[0_0_28px_rgba(34,197,94,0.28)]',
    };
    if (score >= 50) return {
        bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700',
        glow: 'shadow-[0_0_28px_rgba(234,179,8,0.28)]',
    };
    return {
        bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700',
        glow: 'shadow-[0_0_28px_rgba(239,68,68,0.28)]',
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

/** Get icon for orbit category */
function getCategoryIcon(category: string) {
    switch (category) {
        case 'technical': return <Settings2 size={14} className="text-slate-500" />;
        case 'soft': return <Sparkles size={14} className="text-slate-500" />;
        case 'experience': return <AlertCircle size={14} className="text-slate-500" />;
        case 'domain': return <CheckCircle2 size={14} className="text-slate-500" />;
        default: return <Settings2 size={14} className="text-slate-500" />;
    }
}

/**
 * Normalize V1 cached rows to V2 card format.
 * V1 rows have: requirement, status, currentState, suggestion, category
 * V2 rows have: title, orbitCategory, level, relevantChips, context, gaps, additionalChips
 */
function normalizeRowToV2(row: RequirementRow): RequirementRow {
    // Already V2 if it has orbitCategory
    if (row.orbitCategory && row.relevantChips) return row;

    // V1 → V2 mapping
    const categoryMap: Record<string, OrbitCategory> = {
        'technical': 'technical', 'tech': 'technical', 'education': 'experience',
        'experience': 'experience', 'leadership': 'soft', 'communication': 'soft',
        'domain knowledge': 'domain', 'domain': 'domain', 'language': 'language',
    };

    const statusToLevel: Record<string, ScoreLevel> = {
        'met': 'strong', 'partial': 'solid', 'missing': 'gap',
    };

    return {
        ...row,
        title: row.title || row.requirement || row.category || '',
        orbitCategory: categoryMap[(row.category || 'domain').toLowerCase()] || 'domain',
        level: row.level || statusToLevel[row.status || ''] || 'solid',
        relevantChips: row.relevantChips || [],
        context: row.context || row.currentState || '',
        gaps: row.gaps || (row.suggestion ? [row.suggestion] : []),
        additionalChips: row.additionalChips || [],
    };
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

// --- Steckbrief Card ---

function SteckbriefCard({ row, index, t }: { row: RequirementRow; index: number; t: ReturnType<typeof useTranslations> }) {
    const normalized = normalizeRowToV2(row);
    const level = (normalized.level ?? 'solid') as ScoreLevel;
    // BF-1: V1 cached rows have 'status' field and old-style additionalChips (tools, not recommendations).
    // Only show the new "EMPFEHLUNGEN" label for V2 data.
    const isV1Row = !!row.status;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{
                duration: 0.3,
                delay: index * 0.06,
                ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
        >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {getCategoryIcon(normalized.orbitCategory)}
                    <h4 className="text-sm font-semibold text-[#37352F]">
                        {normalized.title}
                    </h4>
                </div>
                <LevelDotsBadge level={level} t={t} />
            </div>

            <div className="px-4 pb-4 space-y-3">
                {/* Relevant Skills — Chips */}
                {normalized.relevantChips.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                            {t('card_relevant_skills')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {normalized.relevantChips.map((chip, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium
                                               bg-blue-50 text-blue-700 border border-blue-100
                                               shadow-[0_0_6px_rgba(59,130,246,0.15)]"
                                >
                                    {chip}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Context — Assessment Text (Bold via **markdown**) */}
                {normalized.context && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                        {renderBoldText(normalized.context)}
                    </p>
                )}

                {/* Gaps — Red alert section */}
                {normalized.gaps.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-red-500 mb-1.5 flex items-center gap-1">
                            <AlertCircle size={11} className="text-red-400" />
                            {t('card_gaps_title')}
                        </p>
                        <ul className="space-y-1 pl-0.5">
                            {normalized.gaps.map((gap, i) => (
                                <li key={i} className="text-xs text-[#37352F] flex gap-2 items-start leading-relaxed">
                                    <span className="text-red-400 mt-0.5 shrink-0">•</span>
                                    <span>
                                        {gap.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
                                            if (part.startsWith('**') && part.endsWith('**')) {
                                                return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
                                            }
                                            return <span key={j}>{part}</span>;
                                        })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Recommendations (V2) or Additional Tools (V1 cached) */}
                {normalized.additionalChips.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                            {t('card_additional_tools')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {normalized.additionalChips.map((chip, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium',
                                        isV1Row
                                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                                    )}
                                >
                                    {chip}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// --- Summary Card (redesigned as Steckbrief) ---

interface SummaryCardProps {
    summaryData: SummaryData;
    overallRecommendation?: string;
    overallScore?: number;
    t: ReturnType<typeof useTranslations>;
}

// Bold text helper — splits on **bold** patterns and renders <strong> tags
function renderBoldText(text: string) {
    return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-semibold text-[#37352F]">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
    });
}

function SummaryCard({ summaryData, overallRecommendation, overallScore, t }: SummaryCardProps) {
    // Derive summaryLevel from overallScore (consistent with center label)
    const summaryLevel: ScoreLevel =
        (overallScore ?? 50) >= 70 ? 'strong'
            : (overallScore ?? 50) >= 50 ? 'solid'
            : 'gap';

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="p-4 space-y-3 overflow-y-auto"
        >
            {/* Summary Steckbrief Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-slate-500" />
                        <h4 className="text-sm font-semibold text-[#37352F]">
                            {t('breakdown_summary')}
                        </h4>
                    </div>
                    <LevelDotsBadge level={summaryLevel} t={t} />
                </div>

                <div className="px-4 pb-4 space-y-3">
                    {/* Strengths — Green chips */}
                    {summaryData.strengths.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 mb-1.5 flex items-center gap-1">
                                <CheckCircle2 size={11} className="text-green-500" />
                                {t('strengths')}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {summaryData.strengths.slice(0, 3).map((s, i) => (
                                    <span key={i} className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-green-50 text-green-700 border border-green-100">
                                        {renderBoldText(s)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Gaps — Red section */}
                    {summaryData.gaps.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-red-500 mb-1.5 flex items-center gap-1">
                                <AlertCircle size={11} className="text-red-400" />
                                {t('gaps')}
                            </p>
                            <ul className="space-y-1 pl-0.5">
                                {summaryData.gaps.slice(0, 3).map((gap, i) => (
                                    <li key={i} className="text-xs text-[#37352F] flex gap-2 items-start leading-relaxed">
                                        <span className="text-red-400 mt-0.5 shrink-0">•</span>
                                        <span>{renderBoldText(gap)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Potential Highlights — Amber recommendations */}
                    {summaryData.potentialHighlights.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 mb-1.5 flex items-center gap-1">
                                <Sparkles size={11} className="text-amber-500" />
                                {t('potential')}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {summaryData.potentialHighlights.slice(0, 3).map((p, i) => (
                                    <span key={i} className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                        {renderBoldText(p)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Overall Recommendation — Context (after Potential as per user request) */}
                    {overallRecommendation && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                                {t('summary_overall')}
                            </p>
                            <p className="text-xs text-slate-600 leading-relaxed">{renderBoldText(overallRecommendation)}</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// --- Empty State placeholder for right panel ---

function EmptyCardState({ t }: { t: ReturnType<typeof useTranslations> }) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center px-6">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="text-slate-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                </svg>
            </div>
            <p className="text-xs text-slate-400">{t('card_empty_hint')}</p>
        </div>
    );
}

// --- Main Orbit Component ---

export function MatchOrbit({ overallScore, breakdown, summaryData, overallRecommendation, requirementRows, onCenterClick, isFromCache }: MatchOrbitProps) {
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
        const t1 = setTimeout(() => setPhase('colorReveal'), 2000);
        const t2 = setTimeout(() => setPhase('expand'), 2500);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [isFromCache, prefersReducedMotion]);

    const safe = {
        technicalSkills:  breakdown?.technicalSkills  ?? { level: 'solid' as ScoreLevel, reasons: [] },
        softSkills:       breakdown?.softSkills        ?? { level: 'solid' as ScoreLevel, reasons: [] },
        experienceLevel:  breakdown?.experienceLevel   ?? { level: 'solid' as ScoreLevel, reasons: [] },
        domainKnowledge:  breakdown?.domainKnowledge   ?? { level: 'solid' as ScoreLevel, reasons: [] },
        languageMatch:    breakdown?.languageMatch     ?? { level: 'solid' as ScoreLevel, reasons: [] },
    };

    // Derive summaryLevel from overallScore (consistent with center label)
    const summaryLevel: ScoreLevel =
        overallScore >= 70 ? 'strong'
            : overallScore >= 50 ? 'solid'
            : 'gap';

    // 5 satellites — language removed (low signal), angles evenly distributed at 72° intervals
    const satellites: SatelliteConfig[] = [
        { key: 'technical',  i18nKey: 'breakdown_technical',  angle: -72,  data: safe.technicalSkills  },
        { key: 'soft',       i18nKey: 'breakdown_soft',       angle: 0,    data: safe.softSkills       },
        { key: 'experience', i18nKey: 'breakdown_experience', angle: 72,   data: safe.experienceLevel  },
        { key: 'domain',     i18nKey: 'breakdown_domain',     angle: 144,  data: safe.domainKnowledge  },
        { key: 'summary',    i18nKey: 'breakdown_summary',    angle: -144, data: { level: summaryLevel, reasons: [] }, isSummary: true },
    ];

    // Filter requirement rows based on active satellite
    const filteredRows = useMemo(() => {
        if (!activeSatellite || activeSatellite === 'center') {
            // Center click → show all cards
            return requirementRows.map(normalizeRowToV2);
        }
        if (activeSatellite === 'summary') {
            return []; // Summary has its own special rendering
        }
        // Satellite click → filter by orbitCategory
        const matched = requirementRows
            .map(normalizeRowToV2)
            .filter(row => row.orbitCategory === activeSatellite);

        // F3-Fallback: If breakdown has a score for this category but no requirementRows exist,
        // create a synthetic card from the breakdown reasons so the panel is never empty with dots.
        if (matched.length === 0) {
            const categoryMap: Record<string, keyof typeof safe> = {
                'technical': 'technicalSkills',
                'soft': 'softSkills',
                'experience': 'experienceLevel',
                'domain': 'domainKnowledge',
            };
            const breakdownKey = categoryMap[activeSatellite];
            if (breakdownKey && safe[breakdownKey]) {
                const bd = safe[breakdownKey];
                const syntheticCard: RequirementRow = {
                    title: t(satellites.find(s => s.key === activeSatellite)?.i18nKey || 'card_default_title'),
                    orbitCategory: activeSatellite as OrbitCategory,
                    level: bd.level,
                    relevantChips: [],
                    context: bd.reasons.join(' '),
                    gaps: [],
                    additionalChips: [],
                };
                return [syntheticCard];
            }
        }
        return matched;
    }, [activeSatellite, requirementRows, safe, t, satellites]);

    const handleSatelliteClick = useCallback((key: string) => {
        setActiveSatellite(prev => (prev === key ? null : key));
    }, []);

    const handleCenterClick = useCallback(() => {
        setActiveSatellite(prev => (prev === 'center' ? null : 'center'));
        onCenterClick?.();
    }, [onCenterClick]);

    // Orbit canvas size
    const containerSize = (ORBIT_RADIUS + SAT_SIZE) * 2 + 24;

    const centerClasses = phase === 'initial'
        ? 'bg-[#002e7a] border-[#002e7a] shadow-[0_0_32px_rgba(0,46,122,0.5)]'
        : cn(fitColor.bg, fitColor.border, fitColor.text, fitColor.glow);

    const showSummary = activeSatellite === 'summary';
    const showCards = activeSatellite === 'center' || (activeSatellite != null && activeSatellite !== 'summary');
    const showEmpty = !activeSatellite;

    return (
        <div className="flex flex-col md:flex-row gap-4 items-start">

            {/* ── LEFT: Orbit Canvas ── */}
            <div
                className="relative shrink-0 mx-auto md:mx-0"
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
                        activeSatellite === 'center' && 'ring-2 ring-[#002e7a]/30',
                    )}
                    style={{
                        width: CENTER_SIZE, height: CENTER_SIZE,
                        top: '50%', left: '50%',
                        marginTop: -(CENTER_SIZE / 2), marginLeft: -(CENTER_SIZE / 2),
                    }}
                    whileHover={!prefersReducedMotion ? { scale: 1.05 } : {}}
                    whileTap={!prefersReducedMotion ? { scale: 0.97 } : {}}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    aria-label={phase !== 'initial' ? t(fitKey) : 'Match'}
                >
                    {phase !== 'initial' && (
                        <>
                            <span className="text-[10px] font-medium opacity-60 leading-none">Match</span>
                            <motion.span
                                className="text-[13px] font-bold leading-tight text-center px-2 mt-0.5"
                                key={phase}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                            >
                                {t(fitKey)}
                            </motion.span>
                        </>
                    )}
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
                                ? { x: offset.x, y: offset.y, opacity: 1, scale: isActive ? 1.1 : 1 }
                                : { x: 0, y: 0, opacity: 0, scale: 0 }
                            }
                            transition={
                                prefersReducedMotion
                                    ? { duration: 0 }
                                    : {
                                        type: 'spring',
                                        stiffness: 380,
                                        damping: 26,
                                        delay: phase === 'expand' ? 0.1 + index * 0.08 : 0,
                                    }
                            }
                            whileHover={!prefersReducedMotion ? { scale: isActive ? 1.1 : 1.07 } : {}}
                            whileTap={!prefersReducedMotion ? { scale: 0.95 } : {}}
                            onClick={() => handleSatelliteClick(sat.key)}
                            aria-label={t(sat.i18nKey)}
                            aria-pressed={isActive}
                        >
                            <span className="text-[10px] font-medium text-[#37352F] leading-tight text-center px-2 w-full hyphens-auto">
                                {t(sat.i18nKey)}
                            </span>
                            <span className="flex gap-0.5 mt-1">
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

            {/* ── RIGHT: Steckbrief Card Stack Panel ── */}
            <div
                className="flex-1 self-stretch rounded-xl border border-slate-200 bg-[#FAFAF9] shadow-sm overflow-hidden"
                style={{ minHeight: containerSize }}
            >
                <AnimatePresence mode="wait">
                    {/* Summary special view */}
                    {showSummary && (
                        <SummaryCard
                            key="summary"
                            summaryData={summaryData}
                            overallRecommendation={overallRecommendation}
                            overallScore={overallScore}
                            t={t}
                        />
                    )}

                    {/* Steckbrief cards */}
                    {showCards && !showSummary && (
                        <motion.div
                            key={`cards-${activeSatellite}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="p-4 space-y-3 overflow-y-auto"
                            style={{ maxHeight: containerSize + 100 }}
                        >
                            {/* Section title */}
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 pb-1">
                                {activeSatellite === 'center'
                                    ? t('card_default_title')
                                    : satellites.find(s => s.key === activeSatellite)
                                        ? t(satellites.find(s => s.key === activeSatellite)!.i18nKey)
                                        : t('card_default_title')
                                }
                            </h3>
                            {filteredRows.map((row, i) => (
                                <SteckbriefCard
                                    key={`${row.orbitCategory}-${i}`}
                                    row={row}
                                    index={i}
                                    t={t}
                                />
                            ))}
                            {filteredRows.length === 0 && (
                                <p className="text-xs text-slate-400 italic py-4 text-center">
                                    {t('card_not_analyzed')}
                                </p>
                            )}
                        </motion.div>
                    )}

                    {/* Empty state */}
                    {showEmpty && (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="h-full"
                        >
                            <EmptyCardState t={t} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
