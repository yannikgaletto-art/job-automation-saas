'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { CvStructuredData } from '@/types/cv'
import { Plus, Trash2, X } from 'lucide-react'
import {
    addSkillGroup,
    addSkillItem,
    updateSkillCategory,
} from '@/lib/utils/cv-inline-editor-helpers'

interface InlineCvEditorProps {
    data: CvStructuredData
    onChange: (updated: CvStructuredData) => void
    onClose: () => void
}

export function InlineCvEditor({ data, onChange, onClose }: InlineCvEditorProps) {
    const t = useTranslations('cv_optimizer')
    const tc = useTranslations('cv_confirm_dialog')

    // -- Personal Info --
    const updatePersonal = (field: keyof CvStructuredData['personalInfo'], value: string) => {
        const updated = structuredClone(data)
        updated.personalInfo[field] = value
        onChange(updated)
    }

    // -- Experience bullets --
    const updateBullet = (expIdx: number, bulletIdx: number, value: string) => {
        const updated = structuredClone(data)
        updated.experience[expIdx].description[bulletIdx].text = value
        onChange(updated)
    }

    const addBullet = (expIdx: number) => {
        const updated = structuredClone(data)
        updated.experience[expIdx].description.push({
            id: crypto.randomUUID(),
            text: '',
        })
        onChange(updated)
    }

    const removeBullet = (expIdx: number, bulletIdx: number) => {
        const updated = structuredClone(data)
        updated.experience[expIdx].description.splice(bulletIdx, 1)
        onChange(updated)
    }

    // -- Skills --
    const updateSkillItem = (skillIdx: number, itemIdx: number, value: string) => {
        const updated = structuredClone(data)
        updated.skills[skillIdx].items[itemIdx] = value
        onChange(updated)
    }

    const updateSkillGroupCategory = (skillIdx: number, value: string) => {
        onChange(updateSkillCategory(data, skillIdx, value))
    }

    const handleAddSkillItem = (skillIdx: number) => {
        onChange(addSkillItem(data, skillIdx))
    }

    const handleAddSkillGroup = () => {
        onChange(addSkillGroup(data, () => crypto.randomUUID()))
    }

    /** Remove a single skill item — filters empty strings to avoid comma artifact */
    const removeSkillItem = (skillIdx: number, itemIdx: number) => {
        const updated = structuredClone(data)
        updated.skills[skillIdx].items.splice(itemIdx, 1)
        onChange(updated)
    }

    /** Remove an entire skill category/group */
    const removeSkillGroup = (skillIdx: number) => {
        const updated = structuredClone(data)
        updated.skills.splice(skillIdx, 1)
        onChange(updated)
    }

    // -- Certifications --
    const updateCert = (certIdx: number, field: 'name' | 'issuer' | 'dateText', value: string) => {
        const updated = structuredClone(data)
        if (!updated.certifications) return
        updated.certifications[certIdx][field] = value
        onChange(updated)
    }

    const removeCert = (certIdx: number) => {
        const updated = structuredClone(data)
        if (!updated.certifications) return
        updated.certifications.splice(certIdx, 1)
        onChange(updated)
    }

    return (
        <div className="h-full overflow-y-auto space-y-6 pr-2">
            {/* Header */}
            <div className="sticky top-0 bg-white pb-3 border-b border-slate-200 z-10">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">{t('preview_edit_title')}</h3>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            {t('preview_edit_note')}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        title={tc('close')}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Personal Info */}
            <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    {tc('section_personal')}
                </p>
                {(['name', 'email', 'phone', 'location', 'linkedin'] as const).map((field) => (
                    <div key={field} className="mb-2">
                        <label className="text-[10px] text-slate-400">
                            {field === 'linkedin' ? 'LinkedIn' : tc(`field_${field}`)}
                        </label>
                        <input
                            type="text"
                            value={data.personalInfo[field] ?? ''}
                            onChange={(e) => updatePersonal(field, e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-md border border-slate-200
                                       focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20
                                       text-slate-800 bg-white"
                        />
                    </div>
                ))}
                {/* Summary */}
                <div className="mb-2">
                    <label className="text-[10px] text-slate-400">{t('field_summary')}</label>
                    <textarea
                        rows={3}
                        value={data.personalInfo.summary ?? ''}
                        onChange={(e) => updatePersonal('summary', e.target.value)}
                        className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-md border border-slate-200
                                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20
                                   text-slate-800 bg-white resize-none"
                    />
                </div>
            </section>

            {/* Experience */}
            <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                    {tc('section_experience')}
                </p>
                {data.experience?.map((exp, eIdx) => (
                    <div key={exp.id} className="mb-5 pl-3 border-l-2 border-slate-100">
                        <p className="text-xs font-semibold text-slate-800 mb-0.5">{exp.company}</p>
                        <p className="text-[10px] text-slate-500 mb-2">{exp.role}</p>
                        {exp.description?.map((bullet, bIdx) => (
                            <div key={bullet.id} className="flex items-start gap-1.5 mb-1.5">
                                <textarea
                                    rows={3}
                                    value={bullet.text}
                                    onChange={(e) => updateBullet(eIdx, bIdx, e.target.value)}
                                    className="flex-1 px-2 py-1 text-xs rounded border border-slate-200
                                               focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20
                                               text-slate-700 bg-white resize-none"
                                />
                                <button
                                    onClick={() => removeBullet(eIdx, bIdx)}
                                    title={t('remove_bullet')}
                                    className="mt-1 p-1 rounded text-slate-300 hover:text-red-500
                                               hover:bg-red-50 transition flex-shrink-0"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => addBullet(eIdx)}
                            className="mt-1 flex items-center gap-1 text-[10px] text-blue-600
                                       hover:text-blue-800 transition"
                        >
                            <Plus size={11} /> {t('add_bullet')}
                        </button>
                    </div>
                ))}
            </section>

            {/* Education */}
            {data.education?.length > 0 && (
                <section>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        {tc('section_education')}
                    </p>
                    {data.education.map((edu) => (
                        <div key={edu.id} className="mb-3 pl-3 border-l-2 border-slate-100">
                            <p className="text-xs font-semibold text-slate-800">{edu.institution}</p>
                            <p className="text-[10px] text-slate-500">{edu.degree}{edu.dateRangeText ? ` | ${edu.dateRangeText}` : ''}</p>
                        </div>
                    ))}
                </section>
            )}

            {/* Skills */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                        {tc('section_skills')}
                    </p>
                    <button
                        onClick={handleAddSkillGroup}
                        className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 transition"
                    >
                        <Plus size={11} /> {t('add_skill_group')}
                    </button>
                </div>
                {data.skills.map((skillGroup, sIdx) => (
                    <div key={skillGroup.id} className="mb-4 pl-3 border-l-2 border-slate-100">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <input
                                type="text"
                                value={skillGroup.category ?? ''}
                                onChange={(e) => updateSkillGroupCategory(sIdx, e.target.value)}
                                placeholder={tc('placeholder_skill_category')}
                                className="flex-1 px-2 py-1 text-[10px] font-medium rounded border border-slate-200
                                           focus:outline-none focus:border-blue-500 text-slate-700 bg-white"
                            />
                            <button
                                onClick={() => removeSkillGroup(sIdx)}
                                title={tc('remove_skill_group')}
                                className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0"
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {skillGroup.items.map((item, iIdx) => (
                                <div key={`${skillGroup.id}-${iIdx}`} className="flex items-center gap-0.5">
                                    <input
                                        type="text"
                                        value={item}
                                        onChange={(e) => updateSkillItem(sIdx, iIdx, e.target.value)}
                                        placeholder={t('placeholder_skill_item')}
                                        className="px-2 py-1 text-[10px] rounded border border-slate-200
                                                   focus:outline-none focus:border-blue-500 text-slate-700
                                                   bg-white w-28"
                                    />
                                    <button
                                        onClick={() => removeSkillItem(sIdx, iIdx)}
                                        title={t('remove_skill')}
                                        className="p-0.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => handleAddSkillItem(sIdx)}
                            className="mt-2 flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 transition"
                        >
                            <Plus size={11} /> {t('add_skill')}
                        </button>
                    </div>
                ))}
            </section>

            {/* Certifications — editable + deletable */}
            {data.certifications && data.certifications.length > 0 && (
                <section>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        {tc('section_certifications')}
                    </p>
                    {data.certifications.map((cert, cIdx) => (
                        <div key={cert.id} className="mb-3 pl-3 border-l-2 border-slate-100">
                            <div className="flex items-start justify-between gap-1 mb-1">
                                <div className="flex-1 space-y-1">
                                    <input
                                        type="text"
                                        value={cert.name ?? ''}
                                        onChange={(e) => updateCert(cIdx, 'name', e.target.value)}
                                        placeholder={tc('placeholder_cert_name')}
                                        className="w-full px-2 py-1 text-[10px] rounded border border-slate-200
                                                   focus:outline-none focus:border-blue-500 text-slate-800 bg-white font-medium"
                                    />
                                    <input
                                        type="text"
                                        value={cert.issuer ?? ''}
                                        onChange={(e) => updateCert(cIdx, 'issuer', e.target.value)}
                                        placeholder={tc('placeholder_cert_issuer')}
                                        className="w-full px-2 py-1 text-[10px] rounded border border-slate-200
                                                   focus:outline-none focus:border-blue-500 text-slate-500 bg-white"
                                    />
                                    <input
                                        type="text"
                                        value={cert.dateText ?? ''}
                                        onChange={(e) => updateCert(cIdx, 'dateText', e.target.value)}
                                        placeholder={tc('placeholder_cert_date')}
                                        className="w-full px-2 py-1 text-[10px] rounded border border-slate-200
                                                   focus:outline-none focus:border-blue-500 text-slate-500 bg-white"
                                    />
                                </div>
                                <button
                                    onClick={() => removeCert(cIdx)}
                                    title={tc('remove_certification')}
                                    className="mt-1 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}
