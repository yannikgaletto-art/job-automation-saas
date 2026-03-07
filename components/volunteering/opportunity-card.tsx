'use client';

import { motion } from 'framer-motion';
import { Heart, ExternalLink, Clock, MapPin } from 'lucide-react';
import type { VolunteeringOpportunity } from '@/types/volunteering';

// ─── Category Labels & Colors ─────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    social: { label: 'Soziales', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
    environment: { label: 'Umwelt', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    education: { label: 'Bildung', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    health: { label: 'Gesundheit', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
    culture: { label: 'Kultur', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
};

const COMMITMENT_LABELS: Record<string, string> = {
    einmalig: 'Einmalig',
    regelmaessig: 'Regelmäßig',
    flexibel: 'Flexibel',
};

interface OpportunityCardProps {
    opportunity: VolunteeringOpportunity;
    isBookmarked: boolean;
    onToggleBookmark: (id: string) => void;
}

export function OpportunityCard({ opportunity, isBookmarked, onToggleBookmark }: OpportunityCardProps) {
    const cat = CATEGORY_CONFIG[opportunity.category] ?? CATEGORY_CONFIG.social;
    const commitment = opportunity.commitment_type ? COMMITMENT_LABELS[opportunity.commitment_type] : null;

    return (
        <motion.div
            className="rounded-xl border border-[#E7E7E5] bg-white shadow-sm overflow-hidden"
            whileHover={{ y: -3, boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.08)' }}
            transition={{ duration: 0.2 }}
        >
            <div className="p-5 space-y-3">
                {/* Top Row: Category + Bookmark */}
                <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border ${cat.bg} ${cat.color}`}>
                        {cat.label}
                    </span>
                    <motion.button
                        onClick={() => onToggleBookmark(opportunity.id)}
                        whileTap={{ scale: 0.85 }}
                        className="p-1.5 rounded-lg hover:bg-[#F7F7F5] transition-colors"
                        aria-label={isBookmarked ? 'Bookmark entfernen' : 'Speichern'}
                    >
                        <Heart
                            className={`w-4.5 h-4.5 transition-colors ${isBookmarked ? 'fill-rose-500 text-rose-500' : 'text-[#A9A9A6] hover:text-rose-400'}`}
                        />
                    </motion.button>
                </div>

                {/* Title */}
                <h3 className="text-[15px] font-semibold text-[#37352F] leading-snug line-clamp-2">
                    {opportunity.title}
                </h3>

                {/* Organization */}
                <p className="text-sm text-[#73726E]">
                    {opportunity.organization}
                </p>

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
                            <span
                                key={tag}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-[#F7F7F5] text-[#73726E] border border-[#E7E7E5]"
                            >
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
                    <span>Details ansehen</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>
        </motion.div>
    );
}
