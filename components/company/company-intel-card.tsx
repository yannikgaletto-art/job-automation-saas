"use client"

import { motion } from "framer-motion"
import { Building2, Globe, Linkedin, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react"
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
    recentNews: string[] // Changed to string[] to match backend
    linkedinActivity: LinkedInPost[]
    confidenceScore: number
    cachedAt?: string
}

export function CompanyIntelCard({
    companyName,
    companyValues,
    recentNews,
    linkedinActivity,
    confidenceScore,
    cachedAt
}: CompanyIntelCardProps) {

    // Determine confidence level properties
    const getConfidenceLevel = (score: number) => {
        if (score >= 0.7) return { label: 'High Confidence', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle }
        if (score >= 0.4) return { label: 'Medium Confidence', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertTriangle }
        return { label: 'Low Confidence', color: 'text-red-600 bg-red-50 border-red-200', icon: HelpCircle }
    }

    const confidence = getConfidenceLevel(confidenceScore)
    const ConfidenceIcon = confidence.icon

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
                            <p className="text-sm text-[#73726E] italic">No values detected.</p>
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
                                        👍 {post.engagement} engagement
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
