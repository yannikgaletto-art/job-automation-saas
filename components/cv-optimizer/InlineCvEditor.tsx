'use client'

import React from 'react'
import { CvStructuredData } from '@/types/cv'
import { Plus, Trash2, X } from 'lucide-react'

interface InlineCvEditorProps {
    data: CvStructuredData
    onChange: (updated: CvStructuredData) => void
    onClose: () => void
}

export function InlineCvEditor({ data, onChange, onClose }: InlineCvEditorProps) {
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

    return (
        <div className="h-full overflow-y-auto space-y-6 pr-2">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-white pb-3 border-b border-slate-200 z-10">
                <h3 className="text-sm font-semibold text-slate-900">Lebenslauf bearbeiten</h3>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Personal Info */}
            <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Persoenliche Daten
                </p>
                {(['name', 'email', 'phone', 'location', 'linkedin'] as const).map((field) => (
                    <div key={field} className="mb-2">
                        <label className="text-[10px] text-slate-400 capitalize">{field}</label>
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
                    <label className="text-[10px] text-slate-400">Summary</label>
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
                    Erfahrung
                </p>
                {data.experience?.map((exp, eIdx) => (
                    <div key={exp.id} className="mb-5 pl-3 border-l-2 border-slate-100">
                        <p className="text-xs font-semibold text-slate-800 mb-0.5">{exp.company}</p>
                        <p className="text-[10px] text-slate-500 mb-2">{exp.role}</p>
                        {exp.description?.map((bullet, bIdx) => (
                            <div key={bullet.id} className="flex items-start gap-1.5 mb-1.5">
                                <textarea
                                    rows={2}
                                    value={bullet.text}
                                    onChange={(e) => updateBullet(eIdx, bIdx, e.target.value)}
                                    className="flex-1 px-2 py-1 text-xs rounded border border-slate-200
                                               focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20
                                               text-slate-700 bg-white resize-none"
                                />
                                <button
                                    onClick={() => removeBullet(eIdx, bIdx)}
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
                            <Plus size={11} /> Bullet hinzufuegen
                        </button>
                    </div>
                ))}
            </section>

            {/* Education */}
            {data.education?.length > 0 && (
                <section>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        Bildung
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
            {data.skills?.length > 0 && (
                <section>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        Skills
                    </p>
                    {data.skills.map((skillGroup, sIdx) => (
                        <div key={skillGroup.id} className="mb-4">
                            <p className="text-xs font-medium text-slate-600 mb-1.5">
                                {skillGroup.category}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {skillGroup.items.map((item, iIdx) => (
                                    <input
                                        key={iIdx}
                                        type="text"
                                        value={item}
                                        onChange={(e) => updateSkillItem(sIdx, iIdx, e.target.value)}
                                        className="px-2 py-1 text-[10px] rounded border border-slate-200
                                                   focus:outline-none focus:border-blue-500 text-slate-700
                                                   bg-white w-28"
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}
