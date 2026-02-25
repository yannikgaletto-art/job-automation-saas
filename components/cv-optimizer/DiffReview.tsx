"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, X, ArrowRight, List } from "lucide-react"
import { CvChange, CvOptimizationProposal, CvStructuredData } from "@/types/cv"
import { cn } from "@/lib/utils"

export interface DiffReviewProps {
    originalCv: CvStructuredData;
    proposal: CvOptimizationProposal;
    onSave: (finalCv: CvStructuredData, acceptedChanges: CvChange[]) => void;
    onCancel: () => void;
}

export function DiffReview({ originalCv, proposal, onSave, onCancel }: DiffReviewProps) {
    const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});

    const handleDecision = (changeId: string, decision: 'accepted' | 'rejected') => {
        setDecisions(prev => ({ ...prev, [changeId]: decision }));
    };

    const pendingCount = proposal.changes.filter(c => !decisions[c.id]).length;
    const acceptedCount = proposal.changes.filter(c => decisions[c.id] === 'accepted' || !decisions[c.id]).length;

    const handleFinalize = () => {
        const accepted = proposal.changes.filter(c => decisions[c.id] === 'accepted' || !decisions[c.id]);
        onSave(proposal.optimized, accepted);
    };

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Änderungen prüfen</h2>
                    <p className="text-sm text-gray-500">
                        {pendingCount > 0
                            ? `${pendingCount} Änderung${pendingCount !== 1 ? 'en' : ''} noch zu prüfen`
                            : `${acceptedCount} Änderung${acceptedCount !== 1 ? 'en' : ''} akzeptiert`
                        }
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <List className="w-4 h-4" /> {proposal.changes.length} Änderungen
                </div>
            </div>

            {/* Diff List */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 max-h-[65vh]">
                <div className="space-y-4">
                    {proposal.changes.map(change => (
                        <motion.div
                            key={change.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "p-4 rounded-xl border bg-white transition-all",
                                decisions[change.id] === 'accepted' ? 'border-green-200 ring-1 ring-green-100' :
                                    decisions[change.id] === 'rejected' ? 'border-red-200 opacity-60' :
                                        'border-gray-200 shadow-sm'
                            )}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md font-medium uppercase tracking-wider">
                                    {change.target.section} • {change.type}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDecision(change.id, 'rejected')}
                                        className={cn("p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors", decisions[change.id] === 'rejected' && "bg-red-100 text-red-700")}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDecision(change.id, 'accepted')}
                                        className={cn("p-1.5 rounded-md hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors", decisions[change.id] === 'accepted' && "bg-green-100 text-green-700")}
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <p className="text-sm font-medium text-gray-800 mb-3 ml-1 border-l-2 border-blue-200 pl-3">
                                &ldquo;{change.reason}&rdquo;
                            </p>

                            <div className="text-sm space-y-2">
                                {change.before && (
                                    <div className="p-3 bg-red-50/50 text-red-800 rounded-lg border border-red-100/50">
                                        <span className="font-semibold text-xs text-red-400 block mb-1">VORHER</span>
                                        {change.before}
                                    </div>
                                )}
                                {change.after && (
                                    <div className="p-3 bg-green-50/50 text-green-800 rounded-lg border border-green-100/50">
                                        <span className="font-semibold text-xs text-green-500 block mb-1">NACHHER</span>
                                        {change.after}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-between items-center">
                <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
                    Abbrechen
                </button>
                <button
                    onClick={handleFinalize}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                    Speichern und Preview <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
