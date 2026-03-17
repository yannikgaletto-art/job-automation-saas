'use client';

import { motion } from 'framer-motion';
import { Heart, ExternalLink, Clock, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VolunteeringOpportunity } from '@/types/volunteering';

// ─── Category Config (colors only — labels from t()) ─────────────
const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
    social:      { color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-200' },
    environment: { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    education:   { color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200' },
    health:      { color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200' },
    culture:     { color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
};

// commitment_type values from DB → locale key
const COMMIT_KEY_MAP: Record<string, string> = {
    einmalig:     'commit_once',
    regelmaessig: 'commit_regular',
    flexibel:     'commit_flexible',
};

interface OpportunityCardProps {
    opportunity: VolunteeringOpportunity;
    isBookmarked: boolean;
    onToggleBookmark: (id: string) => void;
}

export function OpportunityCard({ opportunity, isBookmarked, onToggleBookmark }: OpportunityCardProps) {
    const t = useTranslations('volunteering');
    const catColors = CATEGORY_COLORS[opportunity.category] ?? CATEGORY_COLORS.social;
    const catLabelKey = `label_${opportunity.category}` as Parameters<typeof t>[0];
    const catLabel = t(catLabelKey);
    const commitKey = opportunity.commitment_type ? COMMIT_KEY_MAP[opportunity.commitment_type] : null;
    const commitment = commitKey ? t(commitKey as Parameters<typeof t>[0]) : null;

    return (
        <motion.div
            className="rounded-xl border border-[#E7E7E5] bg-white shadow-sm overflow-hidden"
            whileHover={{ y: -3, boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.08)' }}
            transition={{ duration: 0.2 }}
        >
            <div className="p-5 space-y-3">
                {/* Top Row: Category + Bookmark */}
                <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border ${catColors.bg} ${catColors.color}`}>
                        {catLabel}
                    </span>
                    <motion.button
                        onClick={() => onToggleBookmark(opportunity.id)}
                        whileTap={{ scale: 0.85 }}
                        className="p-1.5 rounded-lg hover:bg-[#F7F7F5] transition-colors"
                        aria-label={isBookmarked ? t('bookmark_remove') : t('bookmark_add')}
                    >
                        <Heart className={`w-4.5 h-4.5 transition-colors ${isBookmarked ? 'fill-rose-500 text-rose-500' : 'text-[#A9A9A6] hover:text-rose-400'}`} />
                    </motion.button>
                </div>

                {/* Title */}
                <h3 className="text-[15px] font-semibold text-[#37352F] leading-snug line-clamp-2">
                    {opportunity.title}
                </h3>

                {/* Organization */}
                <p className="text-sm text-[#73726E]">{opportunity.organization}</p>

                {/* Meta Row */}
                <div className="flex items-center gap-3 text-xs text-[#A9A9A6]">
                    {opportunity.city && (
                        <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {opportunity.city}
                        </span>
                    )}
                    {commitment && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {commitment}
                        </span>
                    )}
                </div>

                {/* Skills Tags */}
                {opportunity.skills_tags && opportunity.skills_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {opportunity.skills_tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-[#F7F7F5] text-[#73726E] border border-[#E7E7E5]">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* External Link */}
                <a
                    href={opportunity.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[#012e7a] hover:text-[#011f5e] font-medium transition-colors mt-1"
                >
                    <span>{t('details_link')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>
        </motion.div>
    );
}
