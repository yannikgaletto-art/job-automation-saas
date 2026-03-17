'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Plus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VoteAggregation } from '@/types/volunteering';

interface CategoryVoteProps {
    votes: VoteAggregation[];
    onVoteSubmitted: () => void;
}

export function CategoryVote({ votes, onVoteSubmitted }: CategoryVoteProps) {
    const t = useTranslations('volunteering');
    const [input, setInput] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        const trimmed = input.trim();
        if (!trimmed || trimmed.length < 2) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/volunteering/votes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category_suggestion: trimmed }),
            });
            if (res.ok) {
                setInput('');
                onVoteSubmitted();
            }
        } catch {
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section>
            <h2 className="text-lg font-semibold text-[#37352F] mb-3">
                {t('vote_title')}
            </h2>
            <p className="text-sm text-[#73726E] mb-4">
                {t('vote_desc')}
            </p>

            {/* Input */}
            <div className="flex gap-2 mb-5">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder={t('vote_placeholder')}
                    maxLength={100}
                    className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20 focus:border-[#012e7a] transition-colors"
                />
                <motion.button
                    onClick={handleSubmit}
                    disabled={submitting || input.trim().length < 2}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-[#012e7a] hover:bg-[#011f5e] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t('vote_submit')}
                </motion.button>
            </div>

            {/* Vote List */}
            <AnimatePresence mode="popLayout">
                {votes.length > 0 && (
                    <motion.div className="space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {votes.map((v) => (
                            <motion.div
                                key={v.category_suggestion}
                                layout
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#E7E7E5] bg-white"
                            >
                                <span className="text-sm text-[#37352F] font-medium capitalize">
                                    {v.category_suggestion}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-[#A9A9A6]">
                                        {v.vote_count} {v.vote_count === 1 ? t('vote_count_singular') : t('vote_count_plural')}
                                    </span>
                                    {v.user_voted && (
                                        <span className="flex items-center gap-0.5 text-xs text-[#012e7a] font-medium">
                                            <ChevronUp className="w-3.5 h-3.5" />
                                            {t('vote_yours')}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
