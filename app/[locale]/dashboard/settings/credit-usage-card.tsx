"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { PLAN_CONFIG } from "@/lib/services/credit-types"
import { cn } from "@/lib/utils"

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface CreditInfo {
    planType: string
    creditsTotal: number
    creditsUsed: number
    topupCredits: number
    creditsAvailable: number
    coachingSessionsTotal: number
    coachingSessionsUsed: number
    jobSearchesTotal: number
    jobSearchesUsed: number
}

// ────────────────────────────────────────────────
// Pill Segment Bar — matches the reference design
// ────────────────────────────────────────────────

function PillBar({
    label,
    used,
    total,
}: {
    label: string
    used: number
    total: number
}) {
    const remaining = Math.max(total - used, 0)
    const fullSegments = Math.floor(remaining)
    const fractionalPart = remaining - fullSegments // e.g. 0.5 for 0.5 credits

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#37352F]">{label}</span>
                <span className="text-sm tabular-nums text-[#73726E]">
                    {remaining}/{total}
                </span>
            </div>
            <div className="flex gap-1">
                {Array.from({ length: total }, (_, i) => {
                    const isFull = i < fullSegments
                    const isFractional = i === fullSegments && fractionalPart > 0

                    if (isFull) {
                        return (
                            <div
                                key={i}
                                className="h-[10px] flex-1 rounded-[3px] bg-[#012e7a] transition-all duration-300"
                            />
                        )
                    }
                    if (isFractional) {
                        // Half-filled segment — proportional inner div
                        return (
                            <div
                                key={i}
                                className="h-[10px] flex-1 rounded-[3px] bg-[#012e7a]/10 border border-[#012e7a]/20 overflow-hidden transition-all duration-300"
                            >
                                <div
                                    className="h-full bg-[#012e7a] rounded-[2px]"
                                    style={{ width: `${fractionalPart * 100}%` }}
                                />
                            </div>
                        )
                    }
                    return (
                        <div
                            key={i}
                            className="h-[10px] flex-1 rounded-[3px] bg-[#012e7a]/10 border border-[#012e7a]/20 transition-all duration-300"
                        />
                    )
                })}
            </div>
        </div>
    )
}

// ────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────

export function CreditUsageCard() {
    const t = useTranslations("settings.credits")
    const [credits, setCredits] = useState<CreditInfo | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch("/api/credits")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch")
                return res.json()
            })
            .then((data: CreditInfo) => {
                // Plan defaults — derived from PLAN_CONFIG (single source of truth)
                const PLAN_DEFAULTS: Record<string, { coaching: number; searches: number; credits: number }> = {
                    free:         { credits: PLAN_CONFIG.free.credits, coaching: PLAN_CONFIG.free.coachingSessions,  searches: PLAN_CONFIG.free.jobSearches },
                    starter:      { credits: PLAN_CONFIG.starter.credits, coaching: PLAN_CONFIG.starter.coachingSessions,  searches: PLAN_CONFIG.starter.jobSearches },
                    durchstarter: { credits: PLAN_CONFIG.durchstarter.credits, coaching: PLAN_CONFIG.durchstarter.coachingSessions, searches: PLAN_CONFIG.durchstarter.jobSearches },
                }
                const defaults = PLAN_DEFAULTS[data.planType] ?? PLAN_DEFAULTS.free
                setCredits({
                    ...data,
                    creditsTotal:          data.creditsTotal          || defaults.credits,
                    coachingSessionsTotal: data.coachingSessionsTotal || defaults.coaching,
                    jobSearchesTotal:      data.jobSearchesTotal      || defaults.searches,
                })
            })
            .catch((err) => {
                console.warn("[CreditUsageCard] Could not load credits:", err.message)
                // Hard fallback for beta (no billing tables yet)
                setCredits({
                    planType: "free",
                    creditsTotal: PLAN_CONFIG.free.credits,
                    creditsUsed: 0,
                    topupCredits: 0,
                    creditsAvailable: PLAN_CONFIG.free.credits,
                    coachingSessionsTotal: PLAN_CONFIG.free.coachingSessions,
                    coachingSessionsUsed: 0,
                    jobSearchesTotal: PLAN_CONFIG.free.jobSearches,
                    jobSearchesUsed: 0,
                })
            })
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="space-y-4 animate-pulse">
                <div className="h-4 bg-[#F1F1EF] rounded w-1/3" />
                <div className="flex gap-1">{Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="h-[10px] flex-1 bg-[#F1F1EF] rounded-[3px]" />
                ))}</div>
                <div className="h-4 bg-[#F1F1EF] rounded w-1/4 mt-4" />
                <div className="flex gap-1">{Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="h-[10px] flex-1 bg-[#F1F1EF] rounded-[3px]" />
                ))}</div>
            </div>
        )
    }

    if (!credits) return null

    const planLabels: Record<string, string> = {
        free: "Free",
        starter: "Starter",
        durchstarter: "Durchstarter",
    }

    return (
        <div className="space-y-5">
            {/* Plan Badge */}
            <div className="flex items-center gap-2.5">
                <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase",
                    credits.planType === "free"
                        ? "bg-[#F1F1EF] text-[#73726E]"
                        : credits.planType === "starter"
                        ? "bg-[#012e7a]/10 text-[#012e7a] ring-1 ring-inset ring-[#012e7a]/20"
                        : "bg-gradient-to-r from-[#002e7a] to-[#0047b3] text-white"
                )}>
                    {planLabels[credits.planType] || credits.planType}
                </span>
                <span className="text-xs text-[#B8B8B5]">
                    {t("plan_label")}
                </span>
            </div>

            {/* Job Queue (was "AI Credits") */}
            <PillBar
                label={t("credits_label")}
                used={Math.max(credits.creditsUsed - credits.topupCredits, 0)}
                total={credits.creditsTotal}
            />

            {/* Coaching */}
            <PillBar
                label={t("coaching_label")}
                used={credits.coachingSessionsUsed}
                total={credits.coachingSessionsTotal}
            />

            {/* Job Searches */}
            <PillBar
                label={t("searches_label")}
                used={credits.jobSearchesUsed}
                total={credits.jobSearchesTotal}
            />

            {/* Cost Hint */}
            <p className="text-xs text-[#B8B8B5] leading-relaxed">
                {t("cost_hint")}
            </p>
        </div>
    )
}
