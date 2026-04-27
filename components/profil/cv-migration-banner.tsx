"use client";

/**
 * CV Migration Banner — Phase 11.
 *
 * Renders a one-time banner on /dashboard/profil for users whose
 * user_profiles.cv_migration_seen_at is NULL. The Single-CV migration
 * (2026-04-28) silently dropped non-master CV documents for impacted
 * users; this banner explains the change and offers a dismiss control
 * (DSGVO Art. 13/14 transparency).
 *
 * Visibility logic:
 *   - Server-side check (Profil page) loads cv_migration_seen_at.
 *   - Banner only renders when the value is NULL (Pathly migration
 *     left those rows untouched specifically for impacted users).
 *   - Dismiss POSTs to /api/profile/dismiss-cv-migration which sets
 *     the timestamp to NOW(), so the banner does not return.
 */
import { useState } from "react";
import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
    /** True when user_profiles.cv_migration_seen_at IS NULL on render. */
    initiallyVisible: boolean;
};

export function CvMigrationBanner({ initiallyVisible }: Props) {
    const [visible, setVisible] = useState(initiallyVisible);
    const [dismissing, setDismissing] = useState(false);
    const t = useTranslations("cv_migration_banner");

    if (!visible) return null;

    const handleDismiss = async () => {
        if (dismissing) return;
        setDismissing(true);
        try {
            await fetch("/api/profile/dismiss-cv-migration", { method: "POST" });
        } catch {
            // Even on network error we close the banner client-side. Worst case
            // it reappears on next visit; user can dismiss again.
        } finally {
            setVisible(false);
        }
    };

    return (
        <div className="rounded-2xl border border-[#012e7a]/20 bg-[#F0F7FF] p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[#012e7a]/10 p-2 shrink-0">
                    <Info className="h-5 w-5 text-[#012e7a]" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[#37352F] leading-snug">
                        {t("title")}
                    </h3>
                    <p className="mt-1 text-sm text-[#37352F]/80 leading-relaxed">
                        {t("body")}
                    </p>
                </div>
                <button
                    onClick={handleDismiss}
                    disabled={dismissing}
                    aria-label={t("dismiss_label")}
                    className="text-[#73726E] hover:text-[#37352F] transition-colors p-1 disabled:opacity-50"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
