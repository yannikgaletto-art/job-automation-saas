"use client";

/**
 * Language Toggle Card — Settings page.
 * Dropdown: DE 🇩🇪 / EN 🇬🇧 / ES 🇪🇸
 * On change: PATCH /api/settings/profile { language } → DB update + set NEXT_LOCALE cookie + reload page with new locale.
 */

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, Globe } from "lucide-react";

const LOCALE_OPTIONS = [
    { code: "de", flag: "🇩🇪" },
    { code: "en", flag: "🇬🇧" },
    { code: "es", flag: "🇪🇸" },
] as const;

export function LanguageToggleCard() {
    const locale = useLocale();
    const t = useTranslations("settings.language");
    const tCommon = useTranslations("common.status");
    const [selected, setSelected] = useState(locale);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Sync with actual locale on mount (in case DB has different value)
    useEffect(() => {
        fetch("/api/settings/profile")
            .then((r) => r.json())
            .then((data) => {
                if (data.success && data.profile?.language) {
                    setSelected(data.profile.language);
                }
            })
            .catch(() => {});
    }, []);

    async function handleChange(newLocale: string) {
        if (newLocale === selected || saving) return;
        setSelected(newLocale);
        setSaving(true);
        setSaved(false);

        try {
            const res = await fetch("/api/settings/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ language: newLocale }),
            });

            if (!res.ok) {
                // Revert on failure
                setSelected(selected);
                setSaving(false);
                return;
            }

            // Set NEXT_LOCALE cookie for middleware
            document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);

            // Navigate to new locale — router.replace handles locale prefix
            // Small delay to let the cookie settle
            setTimeout(() => {
                window.location.href = `/${newLocale}/dashboard/settings`;
            }, 300);
        } catch {
            setSelected(selected);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-[#012e7a]" />
                <span className="text-sm font-medium text-[#37352F]">{t("description")}</span>
            </div>

            <div className="flex gap-2">
                {LOCALE_OPTIONS.map(({ code, flag }) => (
                    <button
                        key={code}
                        onClick={() => handleChange(code)}
                        disabled={saving}
                        className={`
                            flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                            transition-all duration-200 border cursor-pointer
                            ${selected === code
                                ? "bg-[#012e7a] text-white border-[#012e7a] shadow-sm"
                                : "bg-white text-[#37352F] border-[#E7E7E5] hover:border-[#012e7a]/30 hover:bg-[#F7F7F5]"
                            }
                            disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                    >
                        <span className="text-base">{flag}</span>
                        <span>{t(code)}</span>
                        {selected === code && !saving && (
                            <Check className="w-3.5 h-3.5 ml-1" />
                        )}
                    </button>
                ))}
            </div>

            {/* Save Status */}
            {(saving || saved) && (
                <div className="flex items-center gap-1.5 text-xs">
                    {saving ? (
                        <>
                            <Loader2 className="w-3 h-3 animate-spin text-[#012e7a]" />
                            <span className="text-[#73726E]">{tCommon("saving")}</span>
                        </>
                    ) : (
                        <>
                            <Check className="w-3 h-3 text-green-500" />
                            <span className="text-green-600">{t("saved")}</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
