"use client"

import { useState, useEffect } from "react"
import { TableSkeleton } from "@/components/skeletons/table-skeleton"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { formatAppliedDate } from "@/lib/utils/date-formatting"
import { motion } from "framer-motion"
import { EmptyApplicationHistory } from "@/components/empty-states/empty-application-history"
import { cn } from "@/lib/utils"
import { showSafeToast } from "@/lib/utils/toast"

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

export function ApplicationHistory() {
    const [data, setData] = useState<ApiResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetchHistory(page)
    }, [page])

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

    const handleToggleSubmitted = async (appId: string, currentlySubmitted: boolean) => {
        const newSubmitted = !currentlySubmitted
        setTogglingIds(prev => new Set(prev).add(appId))

        // Optimistic update
        setData(prev => {
            if (!prev) return prev
            return {
                ...prev,
                applications: prev.applications.map(app =>
                    app.id === appId
                        ? { ...app, submittedAt: newSubmitted ? new Date().toISOString() : null }
                        : app
                )
            }
        })

        try {
            const res = await fetch('/api/applications/history', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: appId, submitted: newSubmitted })
            })

            if (!res.ok) throw new Error('Failed to update')

            // Confetti on marking as submitted
            if (newSubmitted) {
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
                        if (Date.now() < end) {
                            requestAnimationFrame(frame)
                        }
                    }
                    frame()
                })
            }
        } catch {
            // Revert on error
            setData(prev => {
                if (!prev) return prev
                return {
                    ...prev,
                    applications: prev.applications.map(app =>
                        app.id === appId
                            ? { ...app, submittedAt: currentlySubmitted ? app.submittedAt : null }
                            : app
                    )
                }
            })
            showSafeToast('Fehler beim Speichern', `submit_toggle_error:${appId}`, 'error')
        } finally {
            setTogglingIds(prev => {
                const next = new Set(prev)
                next.delete(appId)
                return next
            })
        }
    }

    if (error) {
        return (
            <div className="text-center py-8 text-sm text-red-500">
                Fehler beim Laden der Application History.
                <button
                    onClick={() => fetchHistory(page)}
                    className="ml-2 text-[#002e7a] hover:underline"
                >
                    Erneut versuchen
                </button>
            </div>
        )
    }

    if (loading) {
        return <TableSkeleton rows={3} columns={4} />
    }

    const isEmpty = !data || data.applications.length === 0

    return (
        <div>
            {/* Table Header — always visible */}
            <div className="grid grid-cols-[1fr_1fr_140px_140px] gap-4 px-5 py-2.5 text-xs font-medium text-[#73726E] uppercase tracking-wider border-b border-[#E7E7E5]">
                <span>Job</span>
                <span>Company</span>
                <span>Fertiggestellt am</span>
                <span className="text-center">Abgeschickt</span>
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
                            const isSubmitted = !!app.submittedAt
                            const isToggling = togglingIds.has(app.id)

                            return (
                                <motion.div
                                    key={app.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className={cn(
                                        "grid grid-cols-[1fr_1fr_140px_140px] gap-4 px-5 py-3.5 items-center border-b border-[#E7E7E5] last:border-b-0 transition-colors",
                                        isSubmitted ? "bg-[#f0fdf4]" : "hover:bg-[#FAFAF9]"
                                    )}
                                >
                                    {/* Job */}
                                    <div className="text-sm text-[#37352F] truncate" title={app.jobTitle}>
                                        {app.jobTitle || "–"}
                                    </div>

                                    {/* Company */}
                                    <div className="text-sm font-medium text-[#37352F] truncate" title={app.companyName}>
                                        {app.companyName}
                                    </div>

                                    {/* Fertiggestellt am */}
                                    <div className="text-sm text-[#73726E]">
                                        {formatAppliedDate(app.appliedAt)}
                                    </div>

                                    {/* Bewerbung abgeschickt — Checkbox */}
                                    <div className="flex justify-center">
                                        <button
                                            onClick={() => handleToggleSubmitted(app.id, isSubmitted)}
                                            disabled={isToggling}
                                            className={cn(
                                                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200",
                                                isSubmitted
                                                    ? "bg-green-500 border-green-500 text-white"
                                                    : "border-[#D6D6D3] hover:border-[#002e7a] bg-white",
                                                isToggling && "opacity-50 cursor-wait"
                                            )}
                                            title={isSubmitted ? "Als nicht abgeschickt markieren" : "Als abgeschickt markieren"}
                                        >
                                            {isSubmitted && <Check className="w-3 h-3" />}
                                        </button>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>

                    {/* Pagination */}
                    {data.pagination.total > data.pagination.limit && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-[#E7E7E5]">
                            <span className="text-xs text-[#73726E]">
                                Seite {data.pagination.page} von {Math.ceil(data.pagination.total / data.pagination.limit)}
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
