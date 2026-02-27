"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Building2, Globe, Linkedin, CheckCircle, AlertTriangle, HelpCircle, Search, X, Loader2 } from "lucide-react"
import { NewsFeed } from "./news-feed"

interface LinkedInPost {
    content: string
    theme: string
    engagement: string
    date: string
}

interface CompanyIntelCardProps {
    companyName: string
    companyValues: string[]
    recentNews: string[]
    linkedinActivity: LinkedInPost[]
    confidenceScore: number
    cachedAt?: string
    /** Batch 7 — Zero-Fake-Data: true wenn Context-Gate ausgelöst hat */
    needsCompanyContext?: boolean
    /** Batch 7 — for re-triggering enrichment with website input */
    jobId?: string
    /** Callback fired after successful re-enrichment */
    onEnrichmentUpdated?: () => void
}

export function CompanyIntelCard({
    companyName,
    companyValues,
    recentNews,
    linkedinActivity,
    confidenceScore,
    cachedAt,
    needsCompanyContext = false,
    jobId,
    onEnrichmentUpdated,
}: CompanyIntelCardProps) {
    const [websiteInput, setWebsiteInput] = useState("")
    const [isResearching, setIsResearching] = useState(false)
    const [contextDismissed, setContextDismissed] = useState(false)

    const handleResearchWithContext = async () => {
        if (!websiteInput.trim() || !jobId) return

        setIsResearching(true)
        try {
            // Step 1: PATCH job with company_website → invalidates cache (Punkt 2)
            const patchRes = await fetch(`/api/jobs/${jobId}/context`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_website: websiteInput.trim() }),
            })
            if (!patchRes.ok) throw new Error('Failed to save website')

            // Step 2: Re-trigger enrichment with fresh context
            const enrichRes = await fetch('/api/jobs/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    companyName,
                    website: websiteInput.trim(),
                }),
            })
            if (!enrichRes.ok) throw new Error('Enrichment failed')

            onEnrichmentUpdated?.()
        } catch (err) {
            console.error('[CompanyIntelCard] Research with context failed:', err)
        } finally {
            setIsResearching(false)
        }
    }

    // Confidence indicator
    const getConfidenceLevel = (score: number) => {
        if (score >= 0.7) return { label: 'High Confidence', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle }
        if (score >= 0.4) return { label: 'Medium Confidence', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertTriangle }
        return { label: 'Low Confidence', color: 'text-red-600 bg-red-50 border-red-200', icon: HelpCircle }
    }

    const confidence = getConfidenceLevel(confidenceScore)
    const ConfidenceIcon = confidence.icon

    // ─── Punkt 1: needs_company_context Empty State ────────────────────────────
    if (needsCompanyContext && !contextDismissed) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-lg border border-amber-200 overflow-hidden"
            >
                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-amber-500" />
                            <h2 className="text-lg font-semibold text-[#37352F]">{companyName}</h2>
                        </div>
                        <button
                            onClick={() => setContextDismissed(true)}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                            title="Überspringen"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-800 mb-1">
                                    Keine verifizierten Informationen gefunden
                                </p>
                                <p className="text-xs text-amber-700">
                                    Für <strong>{companyName}</strong> konnten keine verifizierten Quellen gefunden werden.
                                    Ergänze die Unternehmens-Website für bessere Ergebnisse.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-600">
                            Unternehmens-Website (z.B. myty.com)
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="z.B. myty.com"
                                value={websiteInput}
                                onChange={(e) => setWebsiteInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleResearchWithContext()}
                                className="flex-1 text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                                disabled={isResearching}
                            />
                            <button
                                onClick={handleResearchWithContext}
                                disabled={!websiteInput.trim() || isResearching || !jobId}
                                className="flex items-center gap-1.5 px-3 py-2 bg-[#002e7a] text-white text-sm font-medium rounded-md hover:bg-[#002e7a]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isResearching ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Recherche läuft...</>
                                ) : (
                                    <><Search className="w-4 h-4" /> Recherche starten</>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">
                            Optional — du kannst diesen Schritt mit ✕ überspringen.
                        </p>
                    </div>
                </div>
            </motion.div>
        )
    }

    // ─── Normal Intel Card ─────────────────────────────────────────────────────
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-lg border border-[#E7E7E5] overflow-hidden"
        >
            {/* Header */}
            <div className="p-6 border-b border-[#E7E7E5] flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-5 h-5 text-[#73726E]" />
                        <h2 className="text-xl font-semibold text-[#37352F]">{companyName}</h2>
                    </div>
                    {cachedAt && (
                        <p className="text-xs text-[#73726E]">
                            Last updated: {new Date(cachedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>

                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${confidence.color}`}>
                    <ConfidenceIcon className="w-3.5 h-3.5" />
                    {confidence.label}
                </div>
            </div>

            <div className="p-6 space-y-8">
                {/* Company Values */}
                <section>
                    <h3 className="text-sm font-semibold text-[#37352F] mb-3 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[#73726E]" />
                        Core Values
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {companyValues.length > 0 ? (
                            companyValues.map((value, idx) => (
                                <span
                                    key={idx}
                                    className="px-2.5 py-1 bg-[#F5F5F4] text-[#37352F] text-sm rounded border border-[#E7E7E5]"
                                >
                                    {value}
                                </span>
                            ))
                        ) : (
                            <p className="text-sm text-[#73726E] italic">Keine Werte gefunden.</p>
                        )}
                    </div>
                </section>

                {/* Recent News */}
                <section>
                    <NewsFeed news={recentNews} />
                </section>

                {/* LinkedIn Activity */}
                <section>
                    <h3 className="text-sm font-semibold text-[#37352F] mb-3 flex items-center gap-2">
                        <Linkedin className="w-4 h-4 text-[#0077B5]" />
                        Recent LinkedIn Activity
                    </h3>

                    {linkedinActivity.length > 0 ? (
                        <div className="space-y-3">
                            {linkedinActivity.map((post, idx) => (
                                <div key={idx} className="p-3 bg-[#FAFAF9] rounded border border-[#E7E7E5]">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded capitalize">
                                            {post.theme || 'Update'}
                                        </span>
                                        <span className="text-xs text-[#73726E]">{post.date}</span>
                                    </div>
                                    <p className="text-sm text-[#37352F] mb-2 line-clamp-2">{post.content}</p>
                                    <div className="text-xs text-[#73726E] flex items-center gap-1">
                                        {post.engagement} engagement
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-[#73726E] italic">No recent activity linked.</p>
                    )}
                </section>
            </div>
        </motion.div>
    )
}
