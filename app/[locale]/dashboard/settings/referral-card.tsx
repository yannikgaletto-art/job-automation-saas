"use client"

/**
 * Referral Card — Settings Page Component
 * Feature-Silo: §11 Referral
 *
 * Displays the user's referral link with copy/share functionality
 * and a progress bar showing used vs. remaining referrals (cap: 10).
 *
 * Placed directly below the CreditUsageCard in Settings.
 * Design: Pathly Design System tokens (Notion-inspired).
 */

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Copy, Check, Share2, Gift } from "lucide-react"

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface ReferralData {
    code: string
    link: string
    stats: {
        credited: number
        remaining: number
    }
}

// ────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────

export function ReferralCard() {
    const t = useTranslations("settings.referral")
    const [data, setData] = useState<ReferralData | null>(null)
    const [loading, setLoading] = useState(true)
    const [copied, setCopied] = useState(false)
    const [shareError, setShareError] = useState(false)

    // ── Fetch referral code + stats ──
    useEffect(() => {
        fetch("/api/referral/code")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch")
                return res.json()
            })
            .then((d: ReferralData) => setData(d))
            .catch((err) => {
                console.warn("[ReferralCard] Could not load:", err.message)
            })
            .finally(() => setLoading(false))
    }, [])

    // ── Copy to clipboard ──
    const handleCopy = useCallback(async () => {
        if (!data?.link) return
        try {
            await navigator.clipboard.writeText(data.link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Fallback for older browsers
            const textArea = document.createElement("textarea")
            textArea.value = data.link
            textArea.style.position = "fixed"
            textArea.style.left = "-9999px"
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand("copy")
            document.body.removeChild(textArea)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [data?.link])

    // ── Web Share API (WhatsApp, Telegram, E-Mail) ──
    const handleShare = useCallback(async () => {
        if (!data?.link) return
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Pathly — Bewerbungsassistent",
                    text: t("share_text"),
                    url: data.link,
                })
            } catch {
                // User cancelled share dialog — not an error
            }
        } else {
            // Fallback: just copy
            handleCopy()
            setShareError(true)
            setTimeout(() => setShareError(false), 3000)
        }
    }, [data?.link, handleCopy, t])

    // ── Loading skeleton ──
    if (loading) {
        return (
            <div className="space-y-3 animate-pulse">
                <div className="h-5 bg-[#F1F1EF] rounded w-2/3" />
                <div className="h-10 bg-[#F1F1EF] rounded-lg" />
                <div className="h-3 bg-[#F1F1EF] rounded w-1/3" />
            </div>
        )
    }

    if (!data) {
        return (
            <p className="text-xs text-[#B8B8B5]">{t("error")}</p>
        )
    }

    const { stats } = data
    const isCapReached = stats.remaining === 0

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#012e7a]/10">
                    <Gift className="h-4 w-4 text-[#012e7a]" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">{t("title")}</h3>
                    <p className="text-xs text-[#73726E]">{t("subtitle")}</p>
                </div>
            </div>

            {/* Link + Copy */}
            <div className="flex gap-2">
                <div className="flex-1 flex items-center px-3 py-2 bg-[#F7F7F5] border border-[#E7E7E5] rounded-lg overflow-hidden">
                    <span className="text-xs text-[#73726E] truncate font-mono select-all">
                        {data.link}
                    </span>
                </div>
                <button
                    onClick={handleCopy}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#012e7a] text-white text-xs font-medium hover:bg-[#012e7a]/90 transition-colors"
                    title={t("copy")}
                >
                    {copied ? (
                        <>
                            <Check className="h-3.5 w-3.5" />
                            <span>{t("copied")}</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>{t("copy")}</span>
                        </>
                    )}
                </button>
                <button
                    onClick={handleShare}
                    className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-[#E7E7E5] hover:bg-[#F5F5F4] transition-colors"
                    title={t("share")}
                >
                    <Share2 className="h-4 w-4 text-[#73726E]" />
                </button>
            </div>

            {/* Share fallback hint */}
            {shareError && (
                <p className="text-xs text-emerald-600">{t("copied")}</p>
            )}

            {/* Stats + Progress */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-[#73726E]">
                        {t("stats_used", { count: stats.credited, max: 10 })}
                    </span>
                    {stats.credited > 0 && (
                        <span className="text-xs font-medium text-emerald-600">
                            {t("stats_earned", { amount: stats.credited * 5 })}
                        </span>
                    )}
                </div>

                {/* Progress bar */}
                <div className="flex gap-1">
                    {Array.from({ length: 10 }, (_, i) => (
                        <div
                            key={i}
                            className={`h-[8px] flex-1 rounded-[3px] transition-all duration-300 ${
                                i < stats.credited
                                    ? "bg-emerald-500"
                                    : "bg-[#012e7a]/10 border border-[#012e7a]/20"
                            }`}
                        />
                    ))}
                </div>

                {/* Cap reached notice */}
                {isCapReached && (
                    <p className="text-xs text-amber-600 font-medium">
                        {t("limit_reached")}
                    </p>
                )}
            </div>
        </div>
    )
}
