"use client";

/**
 * Profile Card — LinkedIn URL + Target Role fields.
 * Reads/writes via /api/settings/profile (Double-Assurance).
 * Auto-saves on blur with debounce. Shows save confirmation.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Linkedin, Target, Check, Loader2 } from "lucide-react";

export function ProfileCard() {
    const [linkedinUrl, setLinkedinUrl] = useState("");
    const [targetRole, setTargetRole] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const initialRef = useRef({ linkedin_url: "", target_role: "" });

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/settings/profile");
                const data = await res.json();
                if (data.success) {
                    setLinkedinUrl(data.profile.linkedin_url || "");
                    setTargetRole(data.profile.target_role || "");
                    initialRef.current = {
                        linkedin_url: data.profile.linkedin_url || "",
                        target_role: data.profile.target_role || "",
                    };
                }
            } catch (err) {
                console.error("Failed to load profile", err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const save = useCallback(async (fields: { linkedin_url?: string; target_role?: string }) => {
        // Skip if nothing changed
        const changed = Object.entries(fields).some(
            ([k, v]) => v !== initialRef.current[k as keyof typeof initialRef.current]
        );
        if (!changed) return;

        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch("/api/settings/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(fields),
            });
            const data = await res.json();
            if (!res.ok) {
                return;
            }
            // Update initial ref so we don't re-save same values
            initialRef.current = {
                linkedin_url: data.profile.linkedin_url || "",
                target_role: data.profile.target_role || "",
            };
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
        } finally {
            setSaving(false);
        }
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-3">
                <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
                <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* LinkedIn URL */}
            <div>
                <label htmlFor="linkedin-url" className="flex items-center gap-2 text-sm font-medium text-[#37352F] mb-1.5">
                    <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                    LinkedIn Profil URL
                </label>
                <input
                    id="linkedin-url"
                    type="url"
                    placeholder="https://linkedin.com/in/dein-profil"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    onBlur={() => save({ linkedin_url: linkedinUrl, target_role: targetRole })}
                    className="w-full px-3 py-2 text-sm border border-[#E7E7E5] rounded-lg bg-white text-[#37352F] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20 focus:border-[#012e7a] transition-all"
                />
                <p className="text-xs text-[#A8A29E] mt-1">
                    Pathly kann dein LinkedIn-Profil nutzen, um Bewerbungen besser zu personalisieren.
                </p>
            </div>

            {/* Target Role */}
            <div>
                <label htmlFor="target-role" className="flex items-center gap-2 text-sm font-medium text-[#37352F] mb-1.5">
                    <Target className="w-4 h-4 text-[#012e7a]" />
                    Ziel-Rolle
                </label>
                <input
                    id="target-role"
                    type="text"
                    placeholder="z.B. Senior Product Manager, Account Executive"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    onBlur={() => save({ linkedin_url: linkedinUrl, target_role: targetRole })}
                    className="w-full px-3 py-2 text-sm border border-[#E7E7E5] rounded-lg bg-white text-[#37352F] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20 focus:border-[#012e7a] transition-all"
                />
                <p className="text-xs text-[#A8A29E] mt-1">
                    Definiere deine Wunschrolle — die KI formuliert dann zielgerichteter.
                </p>
            </div>

            {/* Save Status Indicator */}
            {(saving || saved) && (
                <div className="flex items-center gap-1.5 text-xs">
                    {saving ? (
                        <>
                            <Loader2 className="w-3 h-3 animate-spin text-[#012e7a]" />
                            <span className="text-[#73726E]">Speichert...</span>
                        </>
                    ) : (
                        <>
                            <Check className="w-3 h-3 text-green-500" />
                            <span className="text-green-600">Gespeichert</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
