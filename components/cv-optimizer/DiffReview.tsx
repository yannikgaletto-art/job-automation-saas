"use client"

import type { ReactNode } from "react"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, ArrowRight, ChevronRight } from "lucide-react"
import { CvChange, CvOptimizationProposal, CvStructuredData } from "@/types/cv"
import { cn } from "@/lib/utils"

export interface DiffReviewProps {
    originalCv: CvStructuredData;
    proposal: CvOptimizationProposal;
    onSave: (finalCv: CvStructuredData, acceptedChanges: CvChange[]) => void;
    onCancel: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
    experience: "Erfahrung",
    education: "Ausbildung",
    skills: "Skills",
    personalInfo: "Persönliche Info",
    languages: "Sprachen",
    certificates: "Zertifikate",
    certifications: "Zertifikate",
    summary: "Zusammenfassung",
};

const TYPE_LABELS: Record<string, string> = {
    modify: "Modifizieren",
    add: "Ergänzen",
    remove: "Entfernen",
};

function sectionLabel(s: string) {
    return SECTION_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}
function typeLabel(t: string) {
    return TYPE_LABELS[t] ?? t;
}

// Highlight keywords that differ between before and after (very simple word-diff)
function highlightNew(before: string, after: string): ReactNode {
    const beforeWords = new Set(before.toLowerCase().split(/\s+/));
    const parts = after.split(/(\s+)/);
    return parts.map((part, i) => {
        const isNew = part.trim() && !beforeWords.has(part.toLowerCase().replace(/[.,;:()]/g, ""));
        return isNew
            ? <strong key={i} className="font-semibold text-[#012e7a]">{part}</strong>
            : <span key={i}>{part}</span>;
    });
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ChangeRow({
    change,
    decision,
    onDecide,
}: {
    change: CvChange;
    decision: 'accepted' | 'rejected' | undefined;
    onDecide: (id: string, d: 'accepted' | 'rejected') => void;
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
            {/* Row header — clickable toggle (div, not button, to avoid nested-button hydration error) */}
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
                        title="Ablehnen"
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
                        title="Übernehmen"
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

            {/* Expandable Before / After table */}
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
                            /* Remove layout: single box with strikethrough + explanation */
                            <div className="mx-4 mb-4 border border-red-100 rounded-lg overflow-hidden text-sm bg-red-50/30">
                                <div className="px-3 py-3">
                                    <p className="text-gray-400 line-through leading-relaxed">{change.before}</p>
                                    <p className="text-xs text-red-600/70 mt-2 font-medium">Wird entfernt — {change.reason}</p>
                                </div>
                            </div>
                        ) : (
                            /* Modify/Add layout: Vorher/Nachher table */
                            <div className="mx-4 mb-4 border border-gray-100 rounded-lg overflow-hidden text-sm">
                                <table className="w-full table-fixed">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="w-1/2 px-3 py-2 text-left text-xs font-semibold text-gray-500 tracking-wide">Vorher</th>
                                            <th className="w-1/2 px-3 py-2 text-left text-xs font-semibold text-[#012e7a] tracking-wide border-l border-gray-100">Nachher</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="align-top">
                                            <td className="px-3 py-3 text-gray-500 leading-relaxed">
                                                {change.before || <span className="text-gray-300 italic">—</span>}
                                            </td>
                                            <td className="px-3 py-3 leading-relaxed border-l border-gray-100 text-gray-800">
                                                {change.before
                                                    ? highlightNew(change.before, change.after || "")
                                                    : <span className="text-[#012e7a]">{change.after}</span>}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function TypeGroup({
    typeKey,
    changes,
    decisions,
    onDecide,
    onBulkDecide,
}: {
    typeKey: string;
    changes: CvChange[];
    decisions: Record<string, 'accepted' | 'rejected'>;
    onDecide: (id: string, d: 'accepted' | 'rejected') => void;
    onBulkDecide: (ids: string[], d: 'accepted' | 'rejected') => void;
}) {
    const [open, setOpen] = useState(false);
    const ids = changes.map(c => c.id);
    const pending = changes.filter(c => !decisions[c.id]).length;

    return (
        <div className="ml-5">
            {/* Type header — split into toggle + bulk to avoid button-in-button */}
            <div className="flex items-center gap-2 py-1.5 group">
                {/* Toggle clickable area */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(o => !o)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
                    className="flex items-center gap-2 flex-1 cursor-pointer text-sm text-gray-600 hover:text-gray-900 select-none"
                >
                    <ChevronRight className={cn(
                        "w-3.5 h-3.5 text-gray-400 transition-transform duration-200",
                        open && "rotate-90"
                    )} />
                    <span className="text-sm font-medium">{typeLabel(typeKey)}</span>
                    <span className="ml-1 text-xs text-gray-400">({changes.length})</span>
                </div>
                {/* Pending badge + bulk actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {pending > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                            {pending} offen
                        </span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => onBulkDecide(ids, 'rejected')}
                            className="text-[10px] px-2 py-0.5 rounded text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >Alle ablehnen</button>
                        <button
                            onClick={() => onBulkDecide(ids, 'accepted')}
                            className="text-[10px] px-2 py-0.5 rounded text-gray-400 hover:bg-[#012e7a]/10 hover:text-[#012e7a] transition-colors"
                        >Alle übern.</button>
                    </div>
                </div>
            </div>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        <div className="ml-5 mt-1 space-y-2 pb-2">
                            {changes.map(change => (
                                <ChangeRow
                                    key={change.id}
                                    change={change}
                                    decision={decisions[change.id]}
                                    onDecide={onDecide}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SectionGroup({
    sectionKey,
    changesByType,
    decisions,
    onDecide,
    onBulkDecide,
}: {
    sectionKey: string;
    changesByType: Record<string, CvChange[]>;
    decisions: Record<string, 'accepted' | 'rejected'>;
    onDecide: (id: string, d: 'accepted' | 'rejected') => void;
    onBulkDecide: (ids: string[], d: 'accepted' | 'rejected') => void;
}) {
    const [open, setOpen] = useState(false);
    const total = Object.values(changesByType).flat().length;
    const pending = Object.values(changesByType).flat().filter(c => !decisions[c.id]).length;

    return (
        <div className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 py-2.5 w-full text-left group"
            >
                <ChevronRight className={cn(
                    "w-4 h-4 text-gray-500 transition-transform duration-200",
                    open && "rotate-90"
                )} />
                <span className="text-base font-semibold text-gray-900">{sectionLabel(sectionKey)}</span>
                <span className="text-xs text-gray-400">({total})</span>
                {pending > 0 && (
                    <div className="ml-auto flex flex-col items-end gap-0.5">
                        <span className="text-[10px] bg-[#012e7a]/10 text-[#012e7a] px-2 py-0.5 rounded-full font-semibold">
                            {pending} ausstehend
                        </span>
                    </div>
                )}
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-1">
                            {Object.entries(changesByType).map(([typeKey, changes]) => (
                                <TypeGroup
                                    key={typeKey}
                                    typeKey={typeKey}
                                    changes={changes}
                                    decisions={decisions}
                                    onDecide={onDecide}
                                    onBulkDecide={onBulkDecide}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main DiffReview ────────────────────────────────────────────────────────

export function DiffReview({ originalCv, proposal, onSave, onCancel }: DiffReviewProps) {
    const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});

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

    // Group: section → type → changes[]
    const grouped = useMemo(() => {
        const map: Record<string, Record<string, CvChange[]>> = {};
        for (const change of proposal.changes) {
            const sec = change.target.section;
            const typ = change.type;
            if (!map[sec]) map[sec] = {};
            if (!map[sec][typ]) map[sec][typ] = [];
            map[sec][typ].push(change);
        }
        return map;
    }, [proposal.changes]);

    const totalCount = proposal.changes.length;
    const acceptedCount = proposal.changes.filter(c => decisions[c.id] === 'accepted').length;
    const rejectedCount = proposal.changes.filter(c => decisions[c.id] === 'rejected').length;
    const pendingCount = totalCount - acceptedCount - rejectedCount;

    const handleFinalize = () => {
        // Undecided changes are accepted by default
        const accepted = proposal.changes.filter(c => decisions[c.id] !== 'rejected');
        onSave(proposal.optimized, accepted);
    };

    const handleAcceptAll = () => handleBulkDecide(proposal.changes.map(c => c.id), 'accepted');
    const handleRejectAll = () => handleBulkDecide(proposal.changes.map(c => c.id), 'rejected');

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Änderungen prüfen</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {pendingCount > 0
                            ? <><span className="text-amber-600 font-medium">{pendingCount} offen</span> · {acceptedCount} übernommen · {rejectedCount} abgelehnt</>
                            : <span className="text-[#012e7a] font-medium">Alle {totalCount} Änderungen geprüft ✓</span>
                        }
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRejectAll}
                        className="text-xs px-3 py-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200"
                    >
                        Alle ablehnen
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        className="text-xs px-3 py-1.5 rounded-md text-[#012e7a] hover:bg-[#012e7a]/10 transition-colors border border-[#012e7a]/20 font-medium"
                    >
                        Alle übernehmen
                    </button>
                </div>
            </div>

            {/* Notion-style grouped tree */}
            <div className="flex-1 overflow-y-auto px-6 py-4 max-h-[60vh] space-y-1">
                {Object.entries(grouped).map(([sectionKey, changesByType]) => (
                    <SectionGroup
                        key={sectionKey}
                        sectionKey={sectionKey}
                        changesByType={changesByType}
                        decisions={decisions}
                        onDecide={handleDecide}
                        onBulkDecide={handleBulkDecide}
                    />
                ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
                >
                    Abbrechen
                </button>
                <button
                    onClick={handleFinalize}
                    className="px-5 py-2.5 bg-[#012e7a] hover:bg-[#01246b] text-white text-sm font-medium rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                    Speichern und Preview <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
