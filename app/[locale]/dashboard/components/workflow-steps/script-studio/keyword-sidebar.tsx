"use client";

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import type { ScriptBlock } from './block-editor';

interface CategorizedKeywords {
    mustHave: string[];
    niceToHave: string[];
    companySpecific: string[];
}

interface KeywordSidebarProps {
    keywords: CategorizedKeywords;
    blocks: ScriptBlock[];
    mirrorPhrases?: string[];
}

export function KeywordSidebar({ keywords, blocks, mirrorPhrases = [] }: KeywordSidebarProps) {
    // Combine all block content for keyword matching
    const allContent = useMemo(() => {
        return blocks.map(b => b.content).join(' ').toLowerCase();
    }, [blocks]);

    const isKeywordCovered = (keyword: string) => {
        return allContent.includes(keyword.toLowerCase());
    };

    const coveredCount = useMemo(() => {
        const all = [...keywords.mustHave, ...keywords.niceToHave, ...keywords.companySpecific];
        return all.filter(k => isKeywordCovered(k)).length;
    }, [keywords, allContent]);

    const totalCount = keywords.mustHave.length + keywords.niceToHave.length + keywords.companySpecific.length;

    if (totalCount === 0 && mirrorPhrases.length === 0) return null;

    return (
        <div className="space-y-5">
            {/* Mirror Phrases — SPRACHE DER STELLE */}
            {mirrorPhrases.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sprache der Stelle</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {mirrorPhrases.map((phrase) => (
                            <span
                                key={phrase}
                                title="Nutze diese Sprache im Video — Recruiter hören es."
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-help"
                            >
                                {phrase}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Keywords Header */}
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0">Keywords</h4>
            {/* Summary Badge */}
            <div className="flex items-center gap-2 text-sm">
                <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    coveredCount === totalCount
                        ? 'bg-green-100 text-green-700'
                        : coveredCount > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                }`}>
                    {coveredCount}/{totalCount} Keywords
                </div>
            </div>

            {/* Must-Have Keywords */}
            {keywords.mustHave.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Must-Have</h4>
                    <div className="flex flex-wrap gap-1.5">
                        <AnimatePresence mode="popLayout">
                            {keywords.mustHave.map((kw) => {
                                const covered = isKeywordCovered(kw);
                                return (
                                    <motion.span
                                        key={kw}
                                        layout
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                            covered
                                                ? 'bg-green-100 text-green-700 border border-green-200'
                                                : 'bg-red-50 text-red-600 border border-red-200'
                                        }`}
                                    >
                                        {covered
                                            ? <CheckCircle2 className="w-3 h-3" />
                                            : <AlertCircle className="w-3 h-3" />
                                        }
                                        {kw}
                                    </motion.span>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* Nice-to-Have Keywords */}
            {keywords.niceToHave.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nice-to-Have</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {keywords.niceToHave.map((kw) => {
                            const covered = isKeywordCovered(kw);
                            return (
                                <span
                                    key={kw}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                                        covered
                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                            : 'bg-gray-100 text-gray-500 border border-gray-200'
                                    }`}
                                >
                                    {covered && <CheckCircle2 className="w-3 h-3" />}
                                    {kw}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Company-Specific Keywords */}
            {keywords.companySpecific.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Unternehmen</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {keywords.companySpecific.map((kw) => {
                            const covered = isKeywordCovered(kw);
                            return (
                                <span
                                    key={kw}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                                        covered
                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                            : 'bg-blue-50 text-blue-600 border border-blue-200'
                                    }`}
                                >
                                    {covered
                                        ? <CheckCircle2 className="w-3 h-3" />
                                        : <Building2 className="w-3 h-3" />
                                    }
                                    {kw}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
