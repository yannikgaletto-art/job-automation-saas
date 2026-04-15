/**
 * AI-Generated Content Badge
 *
 * EU AI Act Art. 50: Transparenzpflicht
 * — KI-generierte Inhalte müssen als solche erkennbar sein.
 *
 * Reusable badge component with tooltip explanation.
 * Place on Cover Letters, Coaching, CV Optimizer, Company Research outputs.
 *
 * i18n: Uses next-intl for label + tooltip text (de/en/es).
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface AiGeneratedBadgeProps {
    /** Variant determines label text. Defaults to 'generated'. */
    variant?: 'generated' | 'optimized' | 'researched' | 'coach' | 'recommendation';
    /** Optional className for custom positioning */
    className?: string;
}

const VARIANTS = ['generated', 'optimized', 'researched', 'coach', 'recommendation'] as const;

export function AiGeneratedBadge({ variant = 'generated', className = '' }: AiGeneratedBadgeProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const t = useTranslations('ai_badge');

    // Safely resolve variant — fallback to 'generated' if unknown
    const safeVariant = VARIANTS.includes(variant) ? variant : 'generated';
    const label = t(safeVariant);
    const tooltip = t(`tooltip_${safeVariant}` as Parameters<typeof t>[0]);

    return (
        <span
            className={`relative inline-flex items-center gap-1 ${className}`}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-medium select-none cursor-help whitespace-nowrap">
                🤖 {label}
            </span>

            {/* Tooltip */}
            {showTooltip && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#37352F] text-white text-xs rounded-lg shadow-lg max-w-[240px] text-center z-50 whitespace-normal leading-relaxed pointer-events-none">
                    {tooltip}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#37352F] rotate-45 -mt-1" />
                </span>
            )}
        </span>
    );
}
