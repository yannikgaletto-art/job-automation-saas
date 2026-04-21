"use client"

/**
 * ReferralNotificationOverlay — Dashboard Popup
 * Feature-Silo: §11 Referral
 *
 * Shows a centered modal when the user has a pending referral notification:
 * - REFERRED: "Willkommen an Bord! Dank der Einladung von {name}..."
 * - REFERRER: "Sharing is caring! Danke, dass du uns weiterempfohlen hast..."
 *
 * Fetches once on mount, shows at most one notification per session.
 * Dismisses via POST /api/referral/notifications/dismiss.
 *
 * Design: Pathly Design System — clean, no emojis, Notion-inspired.
 */

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import type { ReferralNotification } from "@/app/api/referral/notifications/route"

export function ReferralNotificationOverlay() {
    const t = useTranslations("referral_notification")
    const [notification, setNotification] = useState<ReferralNotification | null>(null)
    const [visible, setVisible] = useState(false)
    const [dismissing, setDismissing] = useState(false)

    // ── Fetch pending notifications on mount ──
    useEffect(() => {
        // Small delay to avoid competing with other overlays (tour, mood check-in)
        const timer = setTimeout(() => {
            fetch("/api/referral/notifications")
                .then((res) => {
                    if (!res.ok) throw new Error("Failed to fetch")
                    return res.json()
                })
                .then((data: { notifications: ReferralNotification[] }) => {
                    if (data.notifications && data.notifications.length > 0) {
                        // Show the first pending notification
                        setNotification(data.notifications[0])
                        setVisible(true)
                    }
                })
                .catch(() => {
                    // Silent — notifications are non-critical
                })
        }, 4000) // 4s delay: after mood check-in + tour settle

        return () => clearTimeout(timer)
    }, [])

    // ── Dismiss handler ──
    const handleDismiss = useCallback(async () => {
        if (!notification || dismissing) return

        setDismissing(true)

        try {
            await fetch("/api/referral/notifications/dismiss", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: notification.id,
                    type: notification.type,
                }),
            })
        } catch {
            // Silent — dismiss failure is non-critical
        }

        setVisible(false)
        setDismissing(false)
    }, [notification, dismissing])

    if (!visible || !notification) return null

    // ── Build message text ──
    const isReferred = notification.type === "referred_welcome"

    const message = isReferred
        ? t("referred_message", { name: notification.referrerName || t("someone") })
        : t("referrer_message")

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-200"
                onClick={handleDismiss}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="relative bg-white rounded-2xl shadow-xl border border-[#E7E7E5] max-w-md w-full p-8 pointer-events-auto animate-in zoom-in-95 fade-in duration-300"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="referral-notification-title"
                >
                    {/* Icon */}
                    <div className="flex justify-center mb-5">
                        <div className="w-14 h-14 rounded-2xl bg-[#012e7a]/10 border border-[#012e7a]/20 flex items-center justify-center">
                            {isReferred ? (
                                // Welcome star icon
                                <svg className="w-7 h-7 text-[#012e7a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                </svg>
                            ) : (
                                // Gift/heart icon for referrer
                                <svg className="w-7 h-7 text-[#012e7a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                                </svg>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <h2
                        id="referral-notification-title"
                        className="text-lg font-semibold text-[#37352F] text-center mb-3"
                    >
                        {isReferred ? t("referred_title") : t("referrer_title")}
                    </h2>

                    {/* Message */}
                    <p className="text-sm text-[#73726E] text-center leading-relaxed mb-6">
                        {message}
                    </p>

                    {/* Credit badge */}
                    <div className="flex justify-center mb-6">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-full border border-emerald-200">
                            +{notification.credits} Credits
                        </span>
                    </div>

                    {/* Dismiss button */}
                    <button
                        onClick={handleDismiss}
                        disabled={dismissing}
                        className="w-full px-4 py-2.5 bg-[#012e7a] text-white text-sm font-medium rounded-lg hover:bg-[#012e7a]/90 transition-colors disabled:opacity-50"
                    >
                        {t("dismiss")}
                    </button>
                </div>
            </div>
        </>
    )
}
