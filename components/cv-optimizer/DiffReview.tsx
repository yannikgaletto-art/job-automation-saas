"use client"

import type { ReactNode } from "react"

import { useState, useMemo } from "react"
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, ArrowRight, ChevronRight } from "lucide-react"
import { CvChange, CvOptimizationProposal, CvStructuredData } from "@/types/cv"
import { applyOptimizations } from "@/lib/utils/cv-merger"
import { cn } from "@/lib/utils"

export interface DiffReviewProps {
    originalCv: CvStructuredData;
    proposal: CvOptimizationProposal;
    atsKeywords: string[];
    onSave: (finalCv: CvStructuredData, acceptedChanges: CvChange[]) => void;
    onCancel: () => void;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface StationGroup {
    id: string;
    label: string;               // Company + Role, or "Profil & Skills"
    sublabel?: string;            // Role for experience stations
    isProfileGroup: boolean;
    changes: CvChange[];
    keywordHits: { count: number; matched: string[] };
    /** Sub-section labels within the Profile group (Summary, Skills, etc.) */
    sectionChanges?: { sectionKey: string; changes: CvChange[] }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SECTION_LABEL_KEYS: Record<string, string> = {
    personalInfo: "section_label_summary",
    skills: "section_label_skills",
    education: "section_label_education",
    languages: "section_label_languages",
    certificates: "section_label_certificates",
    certifications: "section_label_certificates",
};

/**
 * Group changes by Station (experience) or into a "Profil & Skills" bucket.
 * Education changes are placed in the Profil group (not their own stations).
 */
function groupChangesByStation(
    changes: CvChange[],
    cv: CvStructuredData
): StationGroup[] {
    // Experience stations: grouped by entityId
    const expMap = new Map<string, CvChange[]>();
    // Everything else → Profil group
    const profileChanges: CvChange[] = [];

    for (const change of changes) {
        const section = change.target.section;
        if (section === 'experience' && change.target.entityId) {
            const key = change.target.entityId;
            if (!expMap.has(key)) expMap.set(key, []);
            expMap.get(key)!.push(change);
        } else {
            profileChanges.push(change);
        }
    }

    const groups: StationGroup[] = [];

    // Build experience stations
    for (const [entityId, stationChanges] of expMap) {
        const exp = cv.experience?.find((e: any) => e.id === entityId);
        const company = exp?.company || 'Unknown';
        const role = exp?.role || '';
        groups.push({
            id: `station-${entityId}`,
            label: company,
            sublabel: role,
            isProfileGroup: false,
            changes: stationChanges,
            keywordHits: { count: 0, matched: [] }, // computed later
        });
    }

    // Build profile group (if any non-experience changes)
    if (profileChanges.length > 0) {
        // Sub-group by section within Profile
        const sectionMap = new Map<string, CvChange[]>();
        for (const c of profileChanges) {
            const sec = c.target.section;
            if (!sectionMap.has(sec)) sectionMap.set(sec, []);
            sectionMap.get(sec)!.push(c);
        }
        groups.push({
            id: 'station-profile',
            label: '', // resolved via i18n key
            isProfileGroup: true,
            changes: profileChanges,
            keywordHits: { count: 0, matched: [] },
            sectionChanges: Array.from(sectionMap.entries()).map(([sectionKey, changes]) => ({
                sectionKey,
                changes,
            })),
        });
    }

    return groups;
}

/**
 * Compute ATS keyword impact for a station group.
 * Uses DELTA scoring: a keyword only counts if it appears in `after` but NOT in `before`.
 */
function computeKeywordHits(
    group: StationGroup,
    atsKeywords: string[]
): { count: number; matched: string[] } {
    if (!atsKeywords?.length) return { count: 0, matched: [] };

    const hits = new Set<string>();
    const lowerKeywords = atsKeywords.map(k => k.toLowerCase());

    for (const change of group.changes) {
        if (!change.after) continue;
        const afterLower = change.after.toLowerCase();
        const beforeLower = change.before?.toLowerCase() || '';

        for (let i = 0; i < lowerKeywords.length; i++) {
            const kw = lowerKeywords[i];
            // Delta: only count if NEW in after (not already in before)
            if (afterLower.includes(kw) && !beforeLower.includes(kw)) {
                hits.add(atsKeywords[i]); // preserve original case for display
            }
        }
    }

    return { count: hits.size, matched: [...hits] };
}

/**
 * Highlight words in 'after' text that differ from 'before' text.
 * New words get a subtle underline instead of bold color.
 */
function highlightNew(before: string, after: string): ReactNode {
    const beforeWords = new Set(before.toLowerCase().split(/\s+/));
    const parts = after.split(/(\s+)/);
    return parts.map((part, i) => {
        const isNew = part.trim() && !beforeWords.has(part.toLowerCase().replace(/[.,;:()]/g, ""));
        return isNew
            ? <span key={i} className="underline decoration-[#012e7a]/40 font-medium">{part}</span>
            : <span key={i}>{part}</span>;
    });
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ChangeRow({
    change,
    decision,
    onDecide,
    t,
}: {
    change: CvChange;
    decision: 'accepted' | 'rejected' | undefined;
    onDecide: (id: string, d: 'accepted' | 'rejected') => void;
    t: ReturnType<typeof useTranslations>;
}) {
    const [open, setOpen] = useState(false);
    const isRejected = decision === 'rejected';
    const isAccepted = decision === 'accepted';

    return (
        <div className={cn(
            "border rounded-lg transition-all duration-200",
            isAccepted ? "border-[#012e7a]/30 bg-[#012e7a]/[0.03]" :
                isRejected ? "border-gray-200 opacity-45" :
                    "border-gray-200 bg-white"
        )}>
            {/* Row header — div, not button, to avoid nested-button hydration error */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(o => !o)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
                className="w-full flex items-start gap-2 px-4 py-3 text-left group cursor-pointer"
            >
                <ChevronRight className={cn(
                    "w-4 h-4 mt-0.5 text-gray-400 shrink-0 transition-transform duration-200",
                    open && "rotate-90"
                )} />
                <span className={cn(
                    "text-sm text-gray-700 flex-1 leading-snug",
                    isAccepted && "text-[#012e7a]",
                    isRejected && "line-through text-gray-400"
                )}>
                    {change.reason}
                </span>
                {/* Accept/Reject inline */}
                <div className="flex gap-1 ml-3 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onDecide(change.id, 'rejected')}
                        title={t('reject_tooltip')}
                        className={cn(
                            "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                            isRejected
                                ? "bg-red-100 text-red-600"
                                : "text-gray-300 hover:bg-red-50 hover:text-red-500"
                        )}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onDecide(change.id, 'accepted')}
                        title={t('accept_tooltip')}
                        className={cn(
                            "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
                            isAccepted
                                ? "bg-[#012e7a] text-white"
                                : "text-gray-300 hover:bg-[#012e7a]/10 hover:text-[#012e7a]"
                        )}
                    >
                        <Check className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Expandable Before / After — stacked blocks instead of table */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                    >
                        {change.type === 'remove' ? (
                            <div className="mx-4 mb-4 border border-red-100 rounded-lg overflow-hidden text-sm bg-red-50/30">
                                <div className="px-3 py-3">
                                    <p className="text-gray-400 line-through leading-relaxed">{change.before}</p>
                                    <p className="text-xs text-red-600/70 mt-2 font-medium">{t('removed_reason', { reason: change.reason })}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="mx-4 mb-4 space-y-2">
                                {/* Before block — muted, strikethrough, left-border accent */}
                                {change.before && (
                                    <div className="border-l-2 border-[#002e7a]/20 pl-3 py-2">
                                        <p className="text-xs text-gray-400 font-medium mb-1">{t('col_before')}</p>
                                        <p className="text-sm text-[#73726E] line-through leading-relaxed">
                                            {change.before}
                                        </p>
                                    </div>
                                )}
                                {/* After block — primary text, keywords underlined */}
                                <div className="border-l-2 border-[#012e7a]/30 pl-3 py-2">
                                    <p className="text-xs text-[#012e7a] font-medium mb-1">{t('col_after')}</p>
                                    <p className="text-sm text-[#37352F] leading-relaxed">
                                        {change.before
                                            ? highlightNew(change.before, change.after || "")
                                            : <span className="text-[#012e7a] font-medium">{change.after}</span>}
                                    </p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StationGroupComponent({
    group,
    decisions,
    onDecide,
    onBulkDecide,
    defaultOpen,
    t,
}: {
    group: StationGroup;
    decisions: Record<string, 'accepted' | 'rejected'>;
    onDecide: (id: string, d: 'accepted' | 'rejected') => void;
    onBulkDecide: (ids: string[], d: 'accepted' | 'rejected') => void;
    defaultOpen: boolean;
    t: ReturnType<typeof useTranslations>;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const ids = group.changes.map(c => c.id);
    const pending = group.changes.filter(c => !decisions[c.id]).length;
    const hasKeywords = group.keywordHits.count > 0;

    const label = group.isProfileGroup
        ? t('group_profile_skills')
        : group.label;

    return (
        <div className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            {/* Station header — div role="button" to avoid nested-button hydration error */}
            <div className="flex items-center gap-2 py-2.5 group">
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(o => !o)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
                    className="flex items-center gap-2 flex-1 cursor-pointer select-none"
                >
                    <ChevronRight className={cn(
                        "w-4 h-4 text-gray-500 transition-transform duration-200",
                        open && "rotate-90"
                    )} />
                    <div className="flex flex-col">
                        <span className="text-base font-semibold text-gray-900">{label}</span>
                        {group.sublabel && (
                            <span className="text-sm text-[#73726E]">{group.sublabel}</span>
                        )}
                    </div>
                    <span className="text-xs text-gray-400 ml-1">({group.changes.length})</span>
                </div>

                {/* ATS keyword badge + pending badge + bulk actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {hasKeywords ? (
                        <span className="text-[10px] bg-[#012e7a]/10 text-[#012e7a] px-2 py-0.5 rounded-full font-semibold">
                            🎯 {t('keyword_badge', { n: group.keywordHits.count })}
                        </span>
                    ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                            {t('changes_badge', { n: group.changes.length })}
                        </span>
                    )}
                    {pending > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                            {t('pending_badge', { n: pending })}
                        </span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => onBulkDecide(ids, 'rejected')}
                            className="text-[10px] px-2 py-0.5 rounded text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >{t('reject_all')}</button>
                        <button
                            onClick={() => onBulkDecide(ids, 'accepted')}
                            className="text-[10px] px-2 py-0.5 rounded text-gray-400 hover:bg-[#012e7a]/10 hover:text-[#012e7a] transition-colors"
                        >{t('accept_all_short')}</button>
                    </div>
                </div>
            </div>

            {/* Station body */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                    >
                        <div className="ml-6 mt-1 space-y-2 pb-2">
                            {/* Profile group: sub-section labels */}
                            {group.isProfileGroup && group.sectionChanges ? (
                                group.sectionChanges.map(({ sectionKey, changes }) => (
                                    <div key={sectionKey}>
                                        <p className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-1.5 mt-2">
                                            {SECTION_LABEL_KEYS[sectionKey]
                                                ? t(SECTION_LABEL_KEYS[sectionKey])
                                                : sectionKey}
                                        </p>
                                        <div className="space-y-2">
                                            {changes.map(change => (
                                                <ChangeRow
                                                    key={change.id}
                                                    change={change}
                                                    decision={decisions[change.id]}
                                                    onDecide={onDecide}
                                                    t={t}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                /* Experience stations: flat list */
                                group.changes.map(change => (
                                    <ChangeRow
                                        key={change.id}
                                        change={change}
                                        decision={decisions[change.id]}
                                        onDecide={onDecide}
                                        t={t}
                                    />
                                ))
                            )}

                            {/* Matched keywords list */}
                            {group.keywordHits.matched.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-gray-50">
                                    <p className="text-xs text-[#73726E]">
                                        <span className="font-medium">{t('matched_label')}:</span>{' '}
                                        {group.keywordHits.matched.join(', ')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main DiffReview ────────────────────────────────────────────────────────

export function DiffReview({ originalCv, proposal, atsKeywords, onSave, onCancel }: DiffReviewProps) {
    const t = useTranslations('diff_review');
    const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
    const [showConfirmPopup, setShowConfirmPopup] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    const handleDecide = (id: string, d: 'accepted' | 'rejected') => {
        setDecisions(prev => {
            // Toggle: clicking same decision again removes it (back to pending)
            if (prev[id] === d) {
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return { ...prev, [id]: d };
        });
    };

    const handleBulkDecide = (ids: string[], d: 'accepted' | 'rejected') => {
        setDecisions(prev => {
            const next = { ...prev };
            ids.forEach(id => { next[id] = d; });
            return next;
        });
    };

    // Station-based grouping with ATS keyword impact scoring
    const stationGroups = useMemo(() => {
        const groups = groupChangesByStation(proposal.changes, originalCv);

        // Compute keyword hits for each group (delta-impact)
        for (const group of groups) {
            group.keywordHits = computeKeywordHits(group, atsKeywords);
        }

        // Sort: keyword hits desc → change count desc
        // Profile group anchored last unless it has the highest impact
        groups.sort((a, b) => {
            // Primary: keyword hits (descending)
            if (b.keywordHits.count !== a.keywordHits.count) {
                return b.keywordHits.count - a.keywordHits.count;
            }
            // Secondary: change count (descending)
            return b.changes.length - a.changes.length;
        });

        return groups;
    }, [proposal.changes, originalCv, atsKeywords]);

    // First group ID (highest impact) for default-open
    const firstGroupId = stationGroups[0]?.id || '';

    // Reactive ATS keyword coverage — updates as user accepts/rejects changes
    // Uses partial-token matching: multi-word keywords match if ≥2/3 of tokens appear
    const keywordCoverage = useMemo(() => {
        if (!atsKeywords?.length) return { covered: 0, set: new Set<string>() };

        const coveredSet = new Set<string>();
        const activeChanges = proposal.changes.filter(c => decisions[c.id] !== 'rejected');
        // Collect all active after-texts into one corpus for efficient matching
        const corpus = activeChanges
            .map(c => c.after?.toLowerCase() ?? '')
            .join(' ');

        for (const kw of atsKeywords) {
            const kwLower = kw.toLowerCase();
            // Single-word keywords: exact include
            const tokens = kwLower.split(/\s+/).filter(Boolean);
            if (tokens.length <= 1) {
                if (corpus.includes(kwLower)) coveredSet.add(kwLower);
                continue;
            }
            // Multi-word: count how many tokens appear in the corpus
            const matchedTokens = tokens.filter(t => corpus.includes(t));
            const threshold = Math.ceil(tokens.length * 2 / 3);
            if (matchedTokens.length >= threshold) coveredSet.add(kwLower);
        }

        return { covered: coveredSet.size, set: coveredSet };
    }, [atsKeywords, proposal.changes, decisions]);

    const totalCount = proposal.changes.length;
    const acceptedCount = proposal.changes.filter(c => decisions[c.id] === 'accepted').length;
    const rejectedCount = proposal.changes.filter(c => decisions[c.id] === 'rejected').length;
    const pendingCount = totalCount - acceptedCount - rejectedCount;

    /**
     * FIX: Compute finalCv from accepted changes only (not proposal.optimized).
     * proposal.optimized contains ALL changes applied — using it ignores rejections
     * until page reload. Instead, we use applyOptimizations() with the translated
     * base CV and only the accepted changes.
     */
    const handleFinalize = () => {
        const noneReviewed = acceptedCount === 0 && rejectedCount === 0;
        if (noneReviewed && totalCount > 0) {
            setShowConfirmPopup(true);
            return;
        }
        // Undecided changes are accepted by default
        const accepted = proposal.changes.filter(c => decisions[c.id] !== 'rejected');
        const choices: Record<string, 'accepted'> = {};
        accepted.forEach(c => { choices[c.id] = 'accepted'; });
        const baseCv = proposal.translated ?? originalCv;
        const finalCv = applyOptimizations(baseCv, { choices, appliedChanges: accepted });
        onSave(finalCv, accepted);
    };

    const handleConfirmAcceptAll = () => {
        setShowConfirmPopup(false);
        handleBulkDecide(proposal.changes.map(c => c.id), 'accepted');
        const accepted = proposal.changes;
        const choices: Record<string, 'accepted'> = {};
        accepted.forEach(c => { choices[c.id] = 'accepted'; });
        const baseCv = proposal.translated ?? originalCv;
        const finalCv = applyOptimizations(baseCv, { choices, appliedChanges: accepted });
        onSave(finalCv, accepted);
    };

    const handleAcceptAll = () => handleBulkDecide(proposal.changes.map(c => c.id), 'accepted');
    const handleRejectAll = () => handleBulkDecide(proposal.changes.map(c => c.id), 'rejected');

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">{t('header_title')}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {pendingCount > 0
                            ? <><span className="text-amber-600 font-medium">{t('status_pending', { pending: pendingCount })}</span> · {t('status_accepted', { n: acceptedCount })} · {t('status_rejected', { n: rejectedCount })}</>
                            : <span className="text-[#012e7a] font-medium">{t('all_checked', { n: totalCount })}</span>
                        }
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowInfo(prev => !prev)}
                        className="text-xs w-6 h-6 rounded-full flex items-center justify-center text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-blue-200/50"
                        title={t('change_limit_info')}
                    >
                        ℹ
                    </button>
                    <button
                        onClick={handleRejectAll}
                        className="text-xs px-3 py-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200"
                    >
                        {t('reject_all_header')}
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        className="text-xs px-3 py-1.5 rounded-md text-[#012e7a] hover:bg-[#012e7a]/10 transition-colors border border-[#012e7a]/20 font-medium"
                    >
                        {t('accept_all_header')}
                    </button>
                </div>
            </div>

            {/* Collapsible info panel */}
            {showInfo && (
                <div className="mx-6 mt-2 px-3 py-2 bg-blue-50/60 border border-blue-100 rounded-lg">
                    <p className="text-[11px] text-blue-700/80 leading-relaxed">
                        {t('change_limit_info')}
                    </p>
                </div>
            )}

            {/* Main content: Station groups + ATS sidebar */}
            <div className="flex-1 overflow-y-auto max-h-[60vh]">
                <div className={cn(
                    "grid gap-4 px-6 py-4",
                    atsKeywords.length > 0 ? "grid-cols-[1fr_200px]" : "grid-cols-1"
                )}>
                    {/* Station-grouped tree */}
                    <div className="space-y-1 min-w-0">
                        {stationGroups.map((group) => (
                            <StationGroupComponent
                                key={group.id}
                                group={group}
                                decisions={decisions}
                                onDecide={handleDecide}
                                onBulkDecide={handleBulkDecide}
                                defaultOpen={group.id === firstGroupId}
                                t={t}
                            />
                        ))}
                    </div>

                    {/* ATS Keywords sidebar — sticky, only shown when keywords exist */}
                    {atsKeywords.length > 0 && (
                        <div className="sticky top-0 self-start">
                            <div className="border border-gray-100 rounded-lg bg-gray-50/50 p-3">
                                <p className="text-xs font-semibold text-gray-900 mb-0.5">
                                    {t('ats_sidebar_title')}
                                </p>
                                <p className="text-[10px] text-[#73726E] mb-3">
                                    {keywordCoverage.covered}/{atsKeywords.length} {t('ats_sidebar_covered')}
                                </p>
                                {/* Coverage progress bar */}
                                <div className="w-full h-1 bg-gray-200 rounded-full mb-3 overflow-hidden">
                                    <div
                                        className="h-full bg-[#012e7a] rounded-full transition-all duration-300"
                                        style={{ width: `${atsKeywords.length > 0 ? (keywordCoverage.covered / atsKeywords.length) * 100 : 0}%` }}
                                    />
                                </div>
                                <ul className="space-y-1.5">
                                    {atsKeywords.map(kw => {
                                        const isCovered = keywordCoverage.set.has(kw.toLowerCase());
                                        return (
                                            <li key={kw} className="flex items-center gap-1.5 text-xs">
                                                {isCovered ? (
                                                    <span className="w-4 h-4 rounded-full bg-[#012e7a]/10 flex items-center justify-center shrink-0">
                                                        <Check className="w-2.5 h-2.5 text-[#012e7a]" />
                                                    </span>
                                                ) : (
                                                    <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                        <span className="w-1.5 h-0.5 bg-gray-300 rounded-full" />
                                                    </span>
                                                )}
                                                <span className={cn(
                                                    "leading-tight",
                                                    isCovered ? "text-[#37352F] font-medium" : "text-[#73726E]"
                                                )}>
                                                    {kw}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Confirm popup — shown when user clicks Preview without reviewing any change */}
            {showConfirmPopup && (
                <div className="mx-6 mb-2 border border-amber-200 bg-amber-50 rounded-lg p-4 flex flex-col gap-3">
                    <p className="text-sm font-medium text-amber-900">{t('confirm_none_reviewed_title')}</p>
                    <p className="text-xs text-amber-700 leading-relaxed">{t('confirm_none_reviewed_desc')}</p>
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => setShowConfirmPopup(false)}
                            className="px-3 py-1.5 text-xs font-medium text-amber-800 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors"
                        >
                            {t('confirm_review_first')}
                        </button>
                        <button
                            onClick={handleConfirmAcceptAll}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#012e7a] hover:bg-[#01246b] rounded-md transition-colors flex items-center gap-1.5"
                        >
                            <Check className="w-3 h-3" />
                            {t('confirm_accept_all_continue')}
                        </button>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
                >
                    {t('footer_cancel')}
                </button>
                <button
                    onClick={handleFinalize}
                    className="px-5 py-2.5 bg-[#012e7a] hover:bg-[#01246b] text-white text-sm font-medium rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                    {t('footer_save')} <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
