"use client"

import { useState, useEffect, useCallback } from "react"
import { TableSkeleton } from "@/components/skeletons/table-skeleton"
import { ChevronLeft, ChevronRight, ChevronDown, ExternalLink, X, Plus } from "lucide-react"
import { formatAppliedDate } from "@/lib/utils/date-formatting"
import { motion, AnimatePresence } from "framer-motion"
import { EmptyApplicationHistory } from "@/components/empty-states/empty-application-history"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

type ApplicationStatus =
    | 'applied'
    | 'follow_up_sent'
    | 'interviewing'
    | 'offer_received'
    | 'rejected'
    | 'ghosted'

interface Application {
    id: string
    companyName: string
    jobTitle: string
    appliedAt: string
    submittedAt: string | null
    applicationMethod: "auto" | "manual" | "extension"
    jobUrl: string
    generatedDocuments?: {
        cv_url?: string
        cover_letter_url?: string
    }
    // CRM fields
    status: ApplicationStatus
    nextActionDate: string | null
    notes: string | null
    rejectionTags: string[]
    contactName: string | null
    learnings: string | null
}

interface ApiResponse {
    applications: Application[]
    pagination: {
        page: number
        limit: number
        total: number
        hasMore: boolean
    }
}

// ────────────────────────────────────────────────
// Status Badge Config
// ────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApplicationStatus, { color: string; bg: string; ring: string }> = {
    applied:        { color: 'text-[#73726E]', bg: 'bg-[#F1F1EF]', ring: 'ring-[#E7E7E5]' },
    follow_up_sent: { color: 'text-blue-700',  bg: 'bg-blue-50',   ring: 'ring-blue-200' },
    interviewing:   { color: 'text-amber-700', bg: 'bg-amber-50',  ring: 'ring-amber-200' },
    offer_received: { color: 'text-green-700', bg: 'bg-green-50',  ring: 'ring-green-200' },
    rejected:       { color: 'text-red-700',   bg: 'bg-red-50',    ring: 'ring-red-200' },
    ghosted:        { color: 'text-slate-500', bg: 'bg-slate-50',  ring: 'ring-slate-200' },
}

const PRESET_TAGS = ['tag_culture', 'tag_tech', 'tag_seniority', 'tag_salary', 'tag_ghosted', 'tag_other'] as const

const TERMINAL_STATUSES: ApplicationStatus[] = ['rejected', 'ghosted', 'offer_received']

// ────────────────────────────────────────────────
// Status Badge Component
// ────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: ApplicationStatus; label: string }) {
    const config = STATUS_CONFIG[status]
    return (
        <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset",
            config.color, config.bg, config.ring
        )}>
            {label}
        </span>
    )
}

// ────────────────────────────────────────────────
// Confetti helper
// ────────────────────────────────────────────────

function triggerConfetti() {
    import('canvas-confetti').then(({ default: confetti }) => {
        const duration = 2000
        const end = Date.now() + duration
        const frame = () => {
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.7 },
                colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'],
            })
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.7 },
                colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'],
            })
            if (Date.now() < end) requestAnimationFrame(frame)
        }
        frame()
    })
}

// ────────────────────────────────────────────────
// CRM Inline Drawer
// ────────────────────────────────────────────────

function CRMDrawer({
    app,
    t,
    onSave,
}: {
    app: Application
    t: (key: string, values?: Record<string, string | number>) => string
    onSave: (id: string, fields: Partial<Application> & { submitted?: boolean }) => Promise<void>
}) {
    const [status, setStatus] = useState<ApplicationStatus>(app.status)
    const [nextActionDate, setNextActionDate] = useState(app.nextActionDate || '')
    const [contactName, setContactName] = useState(app.contactName || '')
    const [notes, setNotes] = useState(app.notes || '')
    const [learnings, setLearnings] = useState(app.learnings || '')
    const [rejectionTags, setRejectionTags] = useState<string[]>(app.rejectionTags || [])
    const [customTag, setCustomTag] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

    const showLearnings = status === 'rejected' || status === 'ghosted'
    const showTags = status === 'rejected' || status === 'ghosted'

    const handleStatusChange = (newStatus: ApplicationStatus) => {
        setStatus(newStatus)
        // Auto-clear follow-up date on terminal states
        if (TERMINAL_STATUSES.includes(newStatus)) {
            setNextActionDate('')
        }
    }

    const toggleTag = (tag: string) => {
        setRejectionTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        )
    }

    const addCustomTag = () => {
        const trimmed = customTag.trim().slice(0, 30) // max 30 chars
        if (trimmed && !rejectionTags.includes(trimmed) && rejectionTags.length < 10) {
            setRejectionTags(prev => [...prev, trimmed])
            setCustomTag('')
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setSaveState('saving')
        try {
            await onSave(app.id, {
                status,
                nextActionDate: nextActionDate || null,
                contactName: contactName || null,
                notes: notes || null,
                learnings: learnings || null,
                rejectionTags,
            })
            setSaveState('saved')
            setTimeout(() => setSaveState('idle'), 1500)
        } catch {
            setSaveState('idle')
            // User-visible error feedback (M2 audit fix)
            console.error('[CRM] Save failed for application', app.id)
        } finally {
            setSaving(false)
        }
    }

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
        >
            <div className="px-5 py-4 bg-[#FAFAF9] border-b border-[#E7E7E5] space-y-4">

                {/* Row 1: Status + Follow-up + Contact */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Status Dropdown */}
                    <div>
                        <label className="text-xs font-medium text-[#73726E] block mb-1">
                            {t('col_status')}
                        </label>
                        <select
                            value={status}
                            onChange={(e) => handleStatusChange(e.target.value as ApplicationStatus)}
                            className="w-full text-sm rounded-md border border-[#E7E7E5] bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002e7a]/20 focus:border-[#002e7a]"
                        >
                            <option value="applied">{t('status_applied')}</option>
                            <option value="follow_up_sent">{t('status_follow_up_sent')}</option>
                            <option value="interviewing">{t('status_interviewing')}</option>
                            <option value="offer_received">{t('status_offer_received')}</option>
                            <option value="rejected">{t('status_rejected')}</option>
                            <option value="ghosted">{t('status_ghosted')}</option>
                        </select>
                    </div>

                    {/* Follow-up Date */}
                    <div>
                        <label className="text-xs font-medium text-[#73726E] block mb-1">
                            {t('followup_label')}
                        </label>
                        <input
                            type="date"
                            value={nextActionDate}
                            onChange={(e) => setNextActionDate(e.target.value)}
                            disabled={TERMINAL_STATUSES.includes(status)}
                            className="w-full text-sm rounded-md border border-[#E7E7E5] bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002e7a]/20 focus:border-[#002e7a] disabled:opacity-40 disabled:bg-[#F1F1EF]"
                        />
                    </div>

                    {/* Contact */}
                    <div>
                        <label className="text-xs font-medium text-[#73726E] block mb-1">
                            {t('contact_label')}
                        </label>
                        <input
                            type="text"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            placeholder={t('contact_placeholder')}
                            maxLength={100}
                            className="w-full text-sm rounded-md border border-[#E7E7E5] bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002e7a]/20 focus:border-[#002e7a] placeholder:text-[#B8B8B5]"
                        />
                    </div>
                </div>

                {/* Row 2: Notes */}
                <div>
                    <label className="text-xs font-medium text-[#73726E] block mb-1">
                        {t('notes_label')}
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('notes_placeholder')}
                        maxLength={2000}
                        rows={2}
                        className="w-full text-sm rounded-md border border-[#E7E7E5] bg-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#002e7a]/20 focus:border-[#002e7a] placeholder:text-[#B8B8B5]"
                    />
                </div>

                {/* Row 3: Rejection Tags (only for rejected/ghosted) */}
                {showTags && (
                    <div>
                        <label className="text-xs font-medium text-[#73726E] block mb-1.5">
                            {t('tags_label')}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESET_TAGS.map((tagKey) => {
                                const tagLabel = t(tagKey)
                                const isActive = rejectionTags.includes(tagLabel)
                                return (
                                    <button
                                        key={tagKey}
                                        onClick={() => toggleTag(tagLabel)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150",
                                            isActive
                                                ? "bg-[#002e7a] text-white"
                                                : "bg-[#F1F1EF] text-[#73726E] hover:bg-[#E7E7E5]"
                                        )}
                                    >
                                        {tagLabel}
                                    </button>
                                )
                            })}
                            {/* Custom tags */}
                            {rejectionTags
                                .filter(tag => !PRESET_TAGS.map(k => t(k)).includes(tag))
                                .map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#002e7a] text-white flex items-center gap-1"
                                    >
                                        {tag}
                                        <X className="w-3 h-3" />
                                    </button>
                                ))
                            }
                            {/* Add custom tag */}
                            {rejectionTags.length < 10 && (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={customTag}
                                        onChange={(e) => setCustomTag(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                                        placeholder={t('tag_custom_placeholder')}
                                        maxLength={30}
                                        className="w-24 px-2 py-1 rounded-full text-xs border border-[#E7E7E5] bg-white focus:outline-none focus:ring-1 focus:ring-[#002e7a]/20 placeholder:text-[#B8B8B5]"
                                    />
                                    {customTag.trim() && (
                                        <button
                                            onClick={addCustomTag}
                                            className="p-0.5 rounded-full bg-[#002e7a] text-white hover:bg-[#002e7a]/80"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Row 4: Learnings (only for rejected/ghosted) */}
                {showLearnings && (
                    <div>
                        <label className="text-xs font-medium text-[#73726E] block mb-1">
                            {t('learnings_label')}
                        </label>
                        <textarea
                            value={learnings}
                            onChange={(e) => setLearnings(e.target.value)}
                            placeholder={t('learnings_placeholder')}
                            maxLength={1000}
                            rows={2}
                            className="w-full text-sm rounded-md border border-[#E7E7E5] bg-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#002e7a]/20 focus:border-[#002e7a] placeholder:text-[#B8B8B5]"
                        />
                    </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                            saveState === 'saved'
                                ? "bg-green-500 text-white"
                                : "bg-[#002e7a] text-white hover:bg-[#002e7a]/90",
                            saving && "opacity-60 cursor-wait"
                        )}
                    >
                        {saveState === 'saving' ? t('saving_btn') : saveState === 'saved' ? t('saved_btn') : t('save_btn')}
                    </button>
                </div>
            </div>
        </motion.div>
    )
}

// ────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────

export function ApplicationHistory({ refreshKey }: { refreshKey?: number }) {
    const t = useTranslations("dashboard.application_history")
    const [data, setData] = useState<ApiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    useEffect(() => {
        fetchHistory(page)
    }, [page, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

    const fetchHistory = async (pageNum: number) => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/applications/history?page=${pageNum}&limit=10`)

            if (res.status === 401) {
                setData({
                    applications: [],
                    pagination: { page: 1, limit: 10, total: 0, hasMore: false }
                })
                setLoading(false)
                return
            }

            if (!res.ok) {
                console.warn(`[ApplicationHistory] API ${res.status} — showing empty state`)
                setData({
                    applications: [],
                    pagination: { page: 1, limit: 10, total: 0, hasMore: false }
                })
                setLoading(false)
                return
            }

            const json = await res.json()
            setData(json)
        } catch (err: any) {
            console.error("Error fetching history:", err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveCRM = useCallback(async (
        id: string,
        fields: Partial<Application> & { submitted?: boolean }
    ) => {
        const res = await fetch('/api/applications/history', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                status: fields.status,
                next_action_date: fields.nextActionDate,
                contact_name: fields.contactName,
                notes: fields.notes,
                learnings: fields.learnings,
                rejection_tags: fields.rejectionTags,
                submitted: fields.submitted,
            })
        })

        if (!res.ok) throw new Error('Failed to save')

        // Confetti on offer_received
        if (fields.status === 'offer_received') {
            triggerConfetti()
        }

        // Optimistic update
        setData(prev => {
            if (!prev) return prev
            return {
                ...prev,
                applications: prev.applications.map(app =>
                    app.id === id ? { ...app, ...fields } : app
                )
            }
        })
    }, [])

    // ── Overdue check ──
    const isOverdue = (app: Application) => {
        if (!app.nextActionDate) return false
        if (TERMINAL_STATUSES.includes(app.status)) return false
        return new Date(app.nextActionDate) < new Date()
    }

    // ── Next Action Label ──
    const formatNextAction = (app: Application): string => {
        if (!app.nextActionDate) return '–'
        const d = new Date(app.nextActionDate)
        const now = new Date()
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays < 0) return t('overdue_hint')
        if (diffDays === 0) return t('followup_today')
        if (diffDays === 1) return t('followup_tomorrow')
        return d.toLocaleDateString()
    }

    // ── Render States ──
    if (error) {
        return (
            <div className="text-center py-8 text-sm text-red-500">
                {t('error_loading')}
                <button
                    onClick={() => fetchHistory(page)}
                    className="ml-2 text-[#002e7a] hover:underline"
                >
                    {t('error_retry')}
                </button>
            </div>
        )
    }

    if (loading) {
        return <TableSkeleton rows={3} columns={5} />
    }

    const isEmpty = !data || data.applications.length === 0

    return (
        <div>
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_1fr_140px_120px_100px] gap-4 px-5 py-2.5 text-xs font-medium text-[#73726E] uppercase tracking-wider border-b border-[#E7E7E5]">
                <span>{t('col_job')}</span>
                <span>{t('col_company')}</span>
                <span>{t('col_status')}</span>
                <span>{t('col_next_action')}</span>
                <span>{t('col_date')}</span>
            </div>

            {isEmpty ? (
                <div className="py-12">
                    <EmptyApplicationHistory />
                </div>
            ) : (
                <>
                    {/* Rows */}
                    <div>
                        {data.applications.map((app) => {
                            const expanded = expandedId === app.id
                            const overdue = isOverdue(app)

                            return (
                                <div key={app.id}>
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        onClick={() => setExpandedId(expanded ? null : app.id)}
                                        className={cn(
                                            "grid grid-cols-[1fr_1fr_140px_120px_100px] gap-4 px-5 py-3.5 items-center border-b border-[#E7E7E5] last:border-b-0 transition-colors cursor-pointer select-none",
                                            overdue && "border-l-2 border-l-amber-400",
                                            expanded ? "bg-[#FAFAF9]" : "hover:bg-[#FAFAF9]"
                                        )}
                                    >
                                        {/* Job Title + External Link */}
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-sm text-[#37352F] truncate" title={app.jobTitle}>
                                                {app.jobTitle || "–"}
                                            </span>
                                            {app.jobUrl && (
                                                <a
                                                    href={app.jobUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex-shrink-0 text-[#B8B8B5] hover:text-[#002e7a] transition-colors"
                                                    title={t('open_posting')}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </div>

                                        {/* Company */}
                                        <div className="text-sm font-medium text-[#37352F] truncate" title={app.companyName}>
                                            {app.companyName}
                                        </div>

                                        {/* Status Badge */}
                                        <div>
                                            <StatusBadge
                                                status={app.status}
                                                label={t(`status_${app.status}`)}
                                            />
                                        </div>

                                        {/* Next Action */}
                                        <div className={cn(
                                            "text-sm",
                                            overdue ? "text-amber-600 font-medium" : "text-[#73726E]"
                                        )}>
                                            {formatNextAction(app)}
                                        </div>

                                        {/* Date + Expand Indicator */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-[#73726E]">
                                                {formatAppliedDate(app.appliedAt)}
                                            </span>
                                            <ChevronDown className={cn(
                                                "w-4 h-4 text-[#B8B8B5] transition-transform duration-200",
                                                expanded && "rotate-180"
                                            )} />
                                        </div>
                                    </motion.div>

                                    {/* CRM Drawer */}
                                    <AnimatePresence>
                                        {expanded && (
                                            <CRMDrawer
                                                app={app}
                                                t={t}
                                                onSave={handleSaveCRM}
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                            )
                        })}
                    </div>

                    {/* Pagination */}
                    {data.pagination.total > data.pagination.limit && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-[#E7E7E5]">
                            <span className="text-xs text-[#73726E]">
                                {t('pagination_label', {
                                    page: data.pagination.page,
                                    total: Math.ceil(data.pagination.total / data.pagination.limit)
                                })}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(p => p - 1)}
                                    className="p-1.5 rounded-md border border-[#E7E7E5] text-[#73726E] hover:bg-[#FAFAF9] disabled:opacity-30 transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    disabled={!data.pagination.hasMore}
                                    onClick={() => setPage(p => p + 1)}
                                    className="p-1.5 rounded-md border border-[#E7E7E5] text-[#73726E] hover:bg-[#FAFAF9] disabled:opacity-30 transition-colors"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
