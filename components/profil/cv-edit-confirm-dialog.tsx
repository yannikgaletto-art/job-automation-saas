"use client";

/**
 * CvEditConfirmDialog — User-Edit-First confirmation step for CV parses.
 *
 * Shows the LLM's parse result for the user to review/correct before it
 * lands in user_profiles.cv_structured_data. Replaces the previous
 * architecture where the LLM was the source of truth and 15+ post-processors
 * tried to compensate for its drift.
 *
 * Trigger points:
 *   - After /api/documents/upload (CV file)
 *   - After /api/documents/reparse (re-parse button)
 *
 * Close behaviour: closing without "Save" still POSTs the parsed structure
 * as a fallback so the profile never ends up with an orphaned CV document.
 * The user can re-open the dialog later via the re-parse button to make
 * corrections.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Plus, Trash2, Briefcase, GraduationCap, Languages as LanguagesIcon, Award, Wrench, User as UserIcon, ChevronDown, ChevronUp } from "lucide-react";
import type { CvStructuredData } from "@/types/cv";

interface Props {
    parsedData: CvStructuredData;
    cvDocumentId: string;
    onClose: () => void;
    onSaved: () => void;
}

type Experience = CvStructuredData["experience"][number];
type Education = CvStructuredData["education"][number];
type SkillGroup = CvStructuredData["skills"][number];
type Language = CvStructuredData["languages"][number];
type Certification = NonNullable<CvStructuredData["certifications"]>[number];

function newId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Convert bullet array → newline-separated text for textarea editing.
function bulletsToText(bullets: Array<{ id: string; text: string }> | undefined): string {
    return (bullets ?? []).map((b) => b.text).join("\n");
}

// Convert textarea content → bullet array. Preserves existing IDs by index
// where possible so React keys stay stable while typing.
function textToBullets(
    text: string,
    existing: Array<{ id: string; text: string }> | undefined,
): Array<{ id: string; text: string }> {
    const lines = text.split("\n");
    const prev = existing ?? [];
    return lines
        .map((line, i) => ({
            id: prev[i]?.id ?? newId("bullet"),
            text: line.trim(),
        }))
        .filter((b) => b.text.length > 0);
}

function emptyExperience(): Experience {
    return { id: newId("exp"), company: "", role: "", dateRangeText: "", description: [] };
}
function emptyEducation(): Education {
    return { id: newId("edu"), institution: "", degree: "", dateRangeText: "" };
}
function emptyLanguage(): Language {
    return { id: newId("lang"), language: "", proficiency: "" };
}
function emptyCert(): Certification {
    return { id: newId("cert"), name: "", issuer: "", dateText: "" };
}
function emptySkill(): SkillGroup {
    return { id: newId("skill"), category: "", items: [] };
}

export function CvEditConfirmDialog({ parsedData, cvDocumentId, onClose, onSaved }: Props) {
    const t = useTranslations("cv_confirm_dialog");
    const [data, setData] = useState<CvStructuredData>(() => ({
        ...parsedData,
        experience: parsedData.experience ?? [],
        education: parsedData.education ?? [],
        skills: parsedData.skills ?? [],
        languages: parsedData.languages ?? [],
        certifications: parsedData.certifications ?? [],
    }));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // Save the dialog's current state to user_profiles via /confirm-parse.
    const persist = async (payload: CvStructuredData): Promise<boolean> => {
        try {
            const res = await fetch("/api/documents/confirm-parse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cvDocumentId, confirmedStructure: payload }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            return true;
        } catch (err) {
            console.error("[CvEditConfirmDialog] save failed:", err);
            return false;
        }
    };

    const handleSave = async () => {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        const ok = await persist(data);
        setSubmitting(false);
        if (ok) {
            onSaved();
        } else {
            setError(t("save_failed"));
        }
    };

    // Silent fallback: closing without Save still persists the parse so the
    // profile is never out of sync with the stored CV document.
    const handleClose = async () => {
        if (submitting) return;
        setSubmitting(true);
        await persist(data);
        setSubmitting(false);
        onClose();
    };

    // ─── State updaters ─────────────────────────────────────────────────────
    const updatePersonal = (field: keyof CvStructuredData["personalInfo"], value: string) => {
        setData((prev) => ({
            ...prev,
            personalInfo: { ...prev.personalInfo, [field]: value },
        }));
    };

    const updateExperience = (idx: number, patch: Partial<Experience>) => {
        setData((prev) => {
            const next = [...prev.experience];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, experience: next };
        });
    };
    const removeExperience = (idx: number) => {
        setData((prev) => ({ ...prev, experience: prev.experience.filter((_, i) => i !== idx) }));
    };
    const addExperience = () => {
        setData((prev) => ({ ...prev, experience: [...prev.experience, emptyExperience()] }));
    };

    const updateEducation = (idx: number, patch: Partial<Education>) => {
        setData((prev) => {
            const next = [...prev.education];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, education: next };
        });
    };
    const removeEducation = (idx: number) => {
        setData((prev) => ({ ...prev, education: prev.education.filter((_, i) => i !== idx) }));
    };
    const addEducation = () => {
        setData((prev) => ({ ...prev, education: [...prev.education, emptyEducation()] }));
    };

    const updateLanguage = (idx: number, patch: Partial<Language>) => {
        setData((prev) => {
            const next = [...prev.languages];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, languages: next };
        });
    };
    const removeLanguage = (idx: number) => {
        setData((prev) => ({ ...prev, languages: prev.languages.filter((_, i) => i !== idx) }));
    };
    const addLanguage = () => {
        setData((prev) => ({ ...prev, languages: [...prev.languages, emptyLanguage()] }));
    };

    const updateCert = (idx: number, patch: Partial<Certification>) => {
        setData((prev) => {
            const certs = prev.certifications ?? [];
            const next = [...certs];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, certifications: next };
        });
    };
    const removeCert = (idx: number) => {
        setData((prev) => ({
            ...prev,
            certifications: (prev.certifications ?? []).filter((_, i) => i !== idx),
        }));
    };
    const addCert = () => {
        setData((prev) => ({ ...prev, certifications: [...(prev.certifications ?? []), emptyCert()] }));
    };

    const updateSkillGroup = (idx: number, patch: Partial<SkillGroup>) => {
        setData((prev) => {
            const next = [...prev.skills];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, skills: next };
        });
    };
    const updateSkillItems = (idx: number, itemsCsv: string) => {
        const items = itemsCsv.split(",").map((s) => s.trim()).filter(Boolean);
        updateSkillGroup(idx, { items });
    };
    const removeSkillGroup = (idx: number) => {
        setData((prev) => ({ ...prev, skills: prev.skills.filter((_, i) => i !== idx) }));
    };
    const addSkillGroup = () => {
        setData((prev) => ({ ...prev, skills: [...prev.skills, emptySkill()] }));
    };

    // Lock body scroll while dialog is open.
    useEffect(() => {
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = original; };
    }, []);

    const personalInfo = data.personalInfo ?? {};
    const certifications = data.certifications ?? [];

    const inputCls = "w-full text-sm bg-white border border-[#E7E7E5] rounded-md px-2.5 py-1.5 text-[#37352F] placeholder-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#012e7a]/40 focus:border-[#012e7a]/40";
    const labelCls = "text-xs font-medium text-[#73726E]";
    const sectionTitleCls = "text-sm font-semibold text-[#37352F] flex items-center gap-2";

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={handleClose}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-[#E7E7E5] w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#E7E7E5] flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-[#37352F]">{t("title")}</h2>
                        <p className="text-xs text-[#73726E] mt-1 leading-relaxed">{t("subtitle")}</p>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="text-[#A8A29E] hover:text-[#37352F] p-1 rounded transition-colors disabled:opacity-40"
                        title={t("close")}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {/* Personal Info */}
                    <section className="space-y-3">
                        <h3 className={sectionTitleCls}>
                            <UserIcon className="w-4 h-4 text-[#012e7a]" />
                            {t("section_personal")}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className={labelCls}>{t("field_name")}</span>
                                <input
                                    className={inputCls}
                                    value={personalInfo.name ?? ""}
                                    onChange={(e) => updatePersonal("name", e.target.value)}
                                    placeholder={t("placeholder_name")}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className={labelCls}>{t("field_email")}</span>
                                <input
                                    className={inputCls}
                                    value={personalInfo.email ?? ""}
                                    onChange={(e) => updatePersonal("email", e.target.value)}
                                    placeholder={t("placeholder_email")}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className={labelCls}>{t("field_phone")}</span>
                                <input
                                    className={inputCls}
                                    value={personalInfo.phone ?? ""}
                                    onChange={(e) => updatePersonal("phone", e.target.value)}
                                    placeholder={t("placeholder_phone")}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className={labelCls}>{t("field_location")}</span>
                                <input
                                    className={inputCls}
                                    value={personalInfo.location ?? ""}
                                    onChange={(e) => updatePersonal("location", e.target.value)}
                                    placeholder={t("placeholder_location")}
                                />
                            </label>
                        </div>
                    </section>

                    {/* Experience */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className={sectionTitleCls}>
                                <Briefcase className="w-4 h-4 text-[#012e7a]" />
                                {t("section_experience")}
                            </h3>
                            <button
                                onClick={addExperience}
                                className="text-xs text-[#012e7a] hover:text-[#011f5e] transition-colors flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {t("add_experience")}
                            </button>
                        </div>
                        {data.experience.length === 0 ? (
                            <p className="text-xs text-[#A8A29E] italic">{t("empty_experience")}</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.experience.map((exp, idx) => (
                                    <li key={exp.id} className="border border-[#E7E7E5] rounded-lg p-3 space-y-2 bg-white">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                className={inputCls}
                                                value={exp.role ?? ""}
                                                onChange={(e) => updateExperience(idx, { role: e.target.value })}
                                                placeholder={t("placeholder_role")}
                                            />
                                            <input
                                                className={inputCls}
                                                value={exp.company ?? ""}
                                                onChange={(e) => updateExperience(idx, { company: e.target.value })}
                                                placeholder={t("placeholder_company")}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                className={inputCls}
                                                value={exp.dateRangeText ?? ""}
                                                onChange={(e) => updateExperience(idx, { dateRangeText: e.target.value })}
                                                placeholder={t("placeholder_dates")}
                                            />
                                            <button
                                                onClick={() => removeExperience(idx)}
                                                className="text-[#A8A29E] hover:text-red-500 transition-colors p-1.5 shrink-0"
                                                title={t("remove_station")}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            <span className={labelCls}>{t("field_bullets")}</span>
                                            <textarea
                                                className={`${inputCls} min-h-[80px] resize-y leading-relaxed font-mono text-[12.5px]`}
                                                value={bulletsToText(exp.description)}
                                                onChange={(e) => updateExperience(idx, { description: textToBullets(e.target.value, exp.description) })}
                                                placeholder={t("placeholder_bullets")}
                                                rows={Math.max(3, (exp.description?.length ?? 0) + 1)}
                                            />
                                            <p className="text-[10.5px] text-[#A8A29E] italic">{t("hint_bullets")}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Education */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className={sectionTitleCls}>
                                <GraduationCap className="w-4 h-4 text-[#012e7a]" />
                                {t("section_education")}
                            </h3>
                            <button
                                onClick={addEducation}
                                className="text-xs text-[#012e7a] hover:text-[#011f5e] transition-colors flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {t("add_education")}
                            </button>
                        </div>
                        {data.education.length === 0 ? (
                            <p className="text-xs text-[#A8A29E] italic">{t("empty_education")}</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.education.map((edu, idx) => (
                                    <li key={edu.id} className="border border-[#E7E7E5] rounded-lg p-3 space-y-2 bg-white">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                className={inputCls}
                                                value={edu.degree ?? ""}
                                                onChange={(e) => updateEducation(idx, { degree: e.target.value })}
                                                placeholder={t("placeholder_degree")}
                                            />
                                            <input
                                                className={inputCls}
                                                value={edu.institution ?? ""}
                                                onChange={(e) => updateEducation(idx, { institution: e.target.value })}
                                                placeholder={t("placeholder_institution")}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                                            <input
                                                className={inputCls}
                                                value={edu.dateRangeText ?? ""}
                                                onChange={(e) => updateEducation(idx, { dateRangeText: e.target.value })}
                                                placeholder={t("placeholder_dates")}
                                            />
                                            <input
                                                className={`${inputCls} sm:w-32`}
                                                value={edu.grade ?? ""}
                                                onChange={(e) => updateEducation(idx, { grade: e.target.value })}
                                                placeholder={t("placeholder_grade")}
                                            />
                                            <button
                                                onClick={() => removeEducation(idx)}
                                                className="text-[#A8A29E] hover:text-red-500 transition-colors p-1.5 shrink-0"
                                                title={t("remove_education")}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <textarea
                                            className={`${inputCls} min-h-[60px] resize-y leading-relaxed text-[12.5px]`}
                                            value={edu.description ?? ""}
                                            onChange={(e) => updateEducation(idx, { description: e.target.value })}
                                            placeholder={t("placeholder_edu_description")}
                                            rows={2}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Advanced toggle (Languages, Certifications, Skills) */}
                    <div>
                        <button
                            onClick={() => setAdvancedOpen((v) => !v)}
                            className="flex items-center gap-1.5 text-xs font-medium text-[#73726E] hover:text-[#37352F] transition-colors"
                        >
                            {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {t("advanced_toggle")}
                        </button>
                    </div>

                    {advancedOpen && (
                        <>
                            {/* Languages */}
                            <section className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className={sectionTitleCls}>
                                        <LanguagesIcon className="w-4 h-4 text-[#012e7a]" />
                                        {t("section_languages")}
                                    </h3>
                                    <button
                                        onClick={addLanguage}
                                        className="text-xs text-[#012e7a] hover:text-[#011f5e] transition-colors flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t("add_language")}
                                    </button>
                                </div>
                                {/* Datalist for language autocomplete — browser shows suggestions but allows free text */}
                                <datalist id="cv-dialog-language-list">
                                    {["Deutsch","Englisch","Spanisch","Französisch","Italienisch","Portugiesisch",
                                      "Russisch","Polnisch","Türkisch","Arabisch","Chinesisch","Japanisch",
                                      "Niederländisch","Schwedisch","Dänisch","Norwegisch","Finnisch","Griechisch",
                                      "German","English","Spanish","French","Italian","Portuguese","Russian",
                                      "Polish","Turkish","Arabic","Chinese","Japanese","Dutch","Swedish"].map(l => (
                                        <option key={l} value={l} />
                                    ))}
                                </datalist>
                                {data.languages.length === 0 ? (
                                    <p className="text-xs text-[#A8A29E] italic">{t("empty_languages")}</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {data.languages.map((lang, idx) => (
                                            <li key={lang.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                                <input
                                                    className={inputCls}
                                                    list="cv-dialog-language-list"
                                                    value={lang.language ?? ""}
                                                    onChange={(e) => updateLanguage(idx, { language: e.target.value })}
                                                    placeholder={t("placeholder_language")}
                                                />
                                                <input
                                                    className={inputCls}
                                                    value={lang.proficiency ?? ""}
                                                    onChange={(e) => updateLanguage(idx, { proficiency: e.target.value })}
                                                    placeholder={t("placeholder_proficiency")}
                                                />
                                                <button
                                                    onClick={() => removeLanguage(idx)}
                                                    className="text-[#A8A29E] hover:text-red-500 transition-colors p-1.5"
                                                    title={t("remove_language")}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            {/* Certifications */}
                            <section className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className={sectionTitleCls}>
                                        <Award className="w-4 h-4 text-[#012e7a]" />
                                        {t("section_certifications")}
                                    </h3>
                                    <button
                                        onClick={addCert}
                                        className="text-xs text-[#012e7a] hover:text-[#011f5e] transition-colors flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t("add_certification")}
                                    </button>
                                </div>
                                {certifications.length === 0 ? (
                                    <p className="text-xs text-[#A8A29E] italic">{t("empty_certifications")}</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {certifications.map((c, idx) => (
                                            <li key={c.id} className="border border-[#E7E7E5] rounded-lg p-3 space-y-2 bg-white">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    <input
                                                        className={inputCls}
                                                        value={c.name ?? ""}
                                                        onChange={(e) => updateCert(idx, { name: e.target.value })}
                                                        placeholder={t("placeholder_cert_name")}
                                                    />
                                                    <input
                                                        className={inputCls}
                                                        value={c.issuer ?? ""}
                                                        onChange={(e) => updateCert(idx, { issuer: e.target.value })}
                                                        placeholder={t("placeholder_cert_issuer")}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        className={inputCls}
                                                        value={c.dateText ?? ""}
                                                        onChange={(e) => updateCert(idx, { dateText: e.target.value })}
                                                        placeholder={t("placeholder_cert_date")}
                                                    />
                                                    <button
                                                        onClick={() => removeCert(idx)}
                                                        className="text-[#A8A29E] hover:text-red-500 transition-colors p-1.5 shrink-0"
                                                        title={t("remove_certification")}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <textarea
                                                    className={`${inputCls} min-h-[50px] resize-y leading-relaxed text-[12.5px]`}
                                                    value={c.description ?? ""}
                                                    onChange={(e) => updateCert(idx, { description: e.target.value })}
                                                    placeholder={t("placeholder_cert_description")}
                                                    rows={2}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            {/* Skills */}
                            <section className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className={sectionTitleCls}>
                                        <Wrench className="w-4 h-4 text-[#012e7a]" />
                                        {t("section_skills")}
                                    </h3>
                                    <button
                                        onClick={addSkillGroup}
                                        className="text-xs text-[#012e7a] hover:text-[#011f5e] transition-colors flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t("add_skill_group")}
                                    </button>
                                </div>
                                {data.skills.length === 0 ? (
                                    <p className="text-xs text-[#A8A29E] italic">{t("empty_skills")}</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {data.skills.map((s, idx) => (
                                            <li key={s.id} className="border border-[#E7E7E5] rounded-lg p-3 space-y-2 bg-white">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        className={inputCls}
                                                        value={s.category ?? ""}
                                                        onChange={(e) => updateSkillGroup(idx, { category: e.target.value })}
                                                        placeholder={t("placeholder_skill_category")}
                                                    />
                                                    <button
                                                        onClick={() => removeSkillGroup(idx)}
                                                        className="text-[#A8A29E] hover:text-red-500 transition-colors p-1.5 shrink-0"
                                                        title={t("remove_skill_group")}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <input
                                                    className={inputCls}
                                                    value={(s.items ?? []).join(", ")}
                                                    onChange={(e) => updateSkillItems(idx, e.target.value)}
                                                    placeholder={t("placeholder_skill_items")}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </>
                    )}

                    {error && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#E7E7E5] flex flex-col sm:flex-row justify-end gap-3 bg-[#FAFAF9]">
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm text-[#73726E] hover:text-[#37352F] hover:bg-white rounded-lg transition-colors disabled:opacity-40"
                    >
                        {t("looks_off_button")}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={submitting}
                        className="px-5 py-2 text-sm font-medium bg-[#012e7a] text-white rounded-lg hover:bg-[#011f5e] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                        {submitting ? t("saving") : t("looks_good_button")}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
