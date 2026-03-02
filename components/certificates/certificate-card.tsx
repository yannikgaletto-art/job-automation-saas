'use client';

/**
 * CertificateCard — Einzelne Zertifikats-Empfehlung
 *
 * Design: Notion-like (bg-[#FAFAF9], text-[#37352F])
 * Motion: fade-in via parent stagger
 */

import { motion } from 'framer-motion';
import { Clock, Euro, ExternalLink, Star, Award } from 'lucide-react';
import type { CertificateRecommendation } from '@/types/certificates';

interface CertificateCardProps {
    recommendation: CertificateRecommendation;
}

function ReputationStars({ score }: { score: 1 | 2 | 3 }) {
    return (
        <span className="inline-flex items-center gap-0.5" title={`Reputation: ${score}/3`}>
            {Array.from({ length: 3 }).map((_, i) => (
                <Star
                    key={i}
                    className={`w-3 h-3 ${i < score ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                />
            ))}
        </span>
    );
}

export function CertificateCard({ recommendation }: CertificateCardProps) {
    const { title, provider, hasAZAV, priceEstimate, durationEstimate, reputationScore, url, urlValid, reasonForMatch } = recommendation;

    return (
        <motion.div
            className="bg-white rounded-lg border border-[#E8E5E0] p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow"
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
        >
            {/* Header: Provider + Reputation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-[#002e7a]" />
                    <span className="text-xs font-medium text-[#73726E] uppercase tracking-wider">
                        {provider}
                    </span>
                </div>
                <ReputationStars score={reputationScore} />
            </div>

            {/* Title */}
            <h4 className="text-sm font-semibold text-[#37352F] leading-snug">
                {title}
            </h4>

            {/* Reason for match */}
            <p className="text-xs text-[#73726E] italic leading-relaxed">
                {reasonForMatch}
            </p>

            {/* Duration + Price */}
            <div className="flex items-center gap-4 text-xs text-[#37352F]">
                <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#73726E]" />
                    {durationEstimate}
                </span>
                <span className="flex items-center gap-1">
                    <Euro className="w-3.5 h-3.5 text-[#73726E]" />
                    {priceEstimate}
                </span>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
                {hasAZAV && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                        ✓ Förderfähig (AZAV)
                    </span>
                )}
                {reputationScore === 3 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        ⭐ Top Anbieter
                    </span>
                )}
            </div>

            {/* CTA */}
            {urlValid ? (
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-medium text-white bg-[#002e7a] rounded-md hover:bg-[#002e7a]/90 transition-colors"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Jetzt anmelden →
                </a>
            ) : (
                <button
                    disabled
                    className="flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-medium text-slate-400 bg-slate-100 rounded-md border border-slate-200 cursor-not-allowed"
                    title="Link aktuell nicht erreichbar"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Link nicht erreichbar
                </button>
            )}
        </motion.div>
    );
}
