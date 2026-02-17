"use client"

import { useState, useEffect } from "react"
import { TableSkeleton } from "@/components/skeletons/table-skeleton"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Download, ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react"
import { formatAppliedDate } from "@/lib/utils/date-formatting"
import { motion } from "framer-motion"
import { ErrorAlert } from "@/components/ui/error-alert"
import { EmptyApplicationHistory } from "@/components/empty-states/empty-application-history"

interface Application {
    id: string
    companyName: string
    jobTitle: string
    appliedAt: string
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

    useEffect(() => {
        fetchHistory(page)
    }, [page])

    const fetchHistory = async (pageNum: number) => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/applications/history?page=${pageNum}&limit=10`)

            // Handle unauthenticated users gracefully (show empty state instead of error)
            if (res.status === 401) {
                setData({
                    applications: [],
                    pagination: {
                        page: 1,
                        limit: 10,
                        total: 0,
                        hasMore: false
                    }
                })
                setLoading(false)
                return
            }

            if (!res.ok) throw new Error("Failed to fetch history")

            const json = await res.json()
            setData(json)
        } catch (err: any) {
            console.error("Error fetching history:", err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const MethodBadge = ({ method }: { method: Application["applicationMethod"] }) => {
        const variants = {
            auto: { label: "Auto", className: "bg-green-100 text-green-700 hover:bg-green-100" },
            manual: { label: "Manual", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
            extension: { label: "Extension", className: "bg-purple-100 text-purple-700 hover:bg-purple-100" }
        }
        const { label, className } = variants[method] || variants.manual
        return <Badge className={className} variant="secondary">{label}</Badge>
    }

    if (error) {
        return (
            <ErrorAlert
                message="Failed to load application history."
                onRetry={() => fetchHistory(page)}
            />
        )
    }

    return (
        <div className="bg-white rounded-xl border border-[#d6d6d6] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-[#d6d6d6]">
                            <TableHead className="w-[250px] text-[#73726E]">Company & Role</TableHead>
                            <TableHead className="text-[#73726E]">Applied</TableHead>
                            <TableHead className="text-[#73726E]">Method</TableHead>
                            <TableHead className="text-right text-[#73726E]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="p-0">
                                    <div className="p-4">
                                        <TableSkeleton rows={5} columns={4} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : data?.applications.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-64 text-center">
                                    <EmptyApplicationHistory />
                                </TableCell>
                            </TableRow>
                        ) : (
                            data?.applications.map((app) => (
                                <TableRow key={app.id} className="group hover:bg-[#fafaf9] border-[#d6d6d6] transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg font-semibold text-gray-500 uppercase shrink-0">
                                                {app.companyName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-medium text-[#37352F]">{app.companyName}</div>
                                                <div className="text-xs text-gray-500 truncate max-w-[150px]">{app.jobTitle}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                        {formatAppliedDate(app.appliedAt)}
                                    </TableCell>
                                    <TableCell>
                                        <MethodBadge method={app.applicationMethod} />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500 hover:text-[#37352F]"
                                                onClick={() => window.open(app.jobUrl, "_blank")}
                                                title="Open Job URL"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                            {/* Future: Download Documents */}
                                            {/* {app.generatedDocuments?.cv_url && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            )} */}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {data && data.pagination.total > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#d6d6d6] bg-[#fafaf9]">
                    <div className="text-xs text-gray-500">
                        Page {data.pagination.page} of {Math.ceil(data.pagination.total / data.pagination.limit)}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => p - 1)}
                            className="h-8 px-2"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.pagination.hasMore || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="h-8 px-2"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
