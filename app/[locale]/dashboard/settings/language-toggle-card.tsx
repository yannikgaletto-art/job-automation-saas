"use client";

/**
 * Language Toggle Card — Settings page.
 * Circular flag-only buttons: DE 🇩🇪 / EN 🇬🇧 / ES 🇪🇸
 * On change: PATCH /api/settings/profile { language } → DB update + set NEXT_LOCALE cookie + reload page with new locale.
 */

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";

const LOCALE_OPTIONS = [
    { code: "de", flag: "🇩🇪", label: "Deutsch" },
    { code: "en", flag: "🇬🇧", label: "English" },
    { code: "es", flag: "🇪🇸", label: "Español" },
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
            {/* Flag-only circles */}
            <div className="flex gap-3">
                {LOCALE_OPTIONS.map(({ code, flag, label }) => (
                    <button
                        key={code}
                        onClick={() => handleChange(code)}
                        disabled={saving}
                        title={label}
                        aria-label={label}
                        className={`
                            relative w-11 h-11 rounded-full flex items-center justify-center text-xl
                            transition-all duration-200 border-2 cursor-pointer
                            ${selected === code
                                ? "border-[#012e7a] bg-[#012e7a]/10 shadow-sm ring-2 ring-[#012e7a]/20"
                                : "border-[#E7E7E5] bg-white hover:border-[#012e7a]/40 hover:bg-[#F7F7F5]"
                            }
                            disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                    >
                        <span className="leading-none select-none">{flag}</span>
                        {selected === code && !saving && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#012e7a] flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                            </span>
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
