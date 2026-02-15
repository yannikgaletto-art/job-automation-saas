"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Building2, Quote, Newspaper, Linkedin, ChevronDown, ChevronUp, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface Quote {
    quote: string
    author: string
    relevance_score: number
    match_score?: number
    value_connection: string
}

interface LinkedInPost {
    content: string
    theme: string
    engagement: string
    date: string
}

interface CompanyResearchProps {
    companyName: string
    founded?: string
    values: string[]
    quotes: Quote[]
    news: string[]
    linkedinActivity?: LinkedInPost[]
    onQuoteSelect: (quote: string) => void
}

export function CompanyResearchCard({
    companyName,
    founded,
    values,
    quotes,
    news,
    linkedinActivity,
    onQuoteSelect
}: CompanyResearchProps) {
    const [selectedQuote, setSelectedQuote] = useState<string>(quotes[0]?.quote || "")
    const [isExpanded, setIsExpanded] = useState(false)

    const handleQuoteChange = (value: string) => {
        setSelectedQuote(value)
        onQuoteSelect(value)
    }

    return (
        <Card className="border border-[#E7E7E5] shadow-sm bg-[#FAFAF9] overflow-hidden">
            <CardHeader className="pb-3 bg-white border-b border-[#E7E7E5]">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-[#37352F] flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-[#73726E]" />
                        Running Research: {companyName}
                    </CardTitle>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Insights Ready
                    </Badge>
                </div>
                <CardDescription className="text-[#73726E] mt-1">
                    Analysis based on public data, values, and recent activity.
                </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
                {/* 1. Quick Stats & Values */}
                <div className="p-5 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {founded && (
                            <Badge variant="secondary" className="bg-[#F0F0EF] text-[#37352F]">
                                Founded: {founded}
                            </Badge>
                        )}
                        {values.map((value, idx) => (
                            <Badge key={idx} variant="outline" className="border-[#E7E7E5] text-[#37352F]">
                                {value}
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* 2. Quote Selection */}
                <div className="px-5 pb-5">
                    <h4 className="text-sm font-medium text-[#37352F] mb-3 flex items-center gap-2">
                        <Quote className="w-4 h-4" />
                        Choose a Quote for your Intro
                    </h4>
                    <RadioGroup value={selectedQuote} onValueChange={handleQuoteChange} className="space-y-3">
                        {quotes.map((quote, idx) => (
                            <Label
                                key={idx}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                    selectedQuote === quote.quote
                                        ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200"
                                        : "bg-white border-[#E7E7E5] hover:bg-[#F5F5F4]"
                                )}
                            >
                                <RadioGroupItem value={quote.quote} className="mt-1" />
                                <div className="space-y-1">
                                    <p className="text-sm text-[#37352F] italic">"{quote.quote}"</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-[#73726E] font-medium">— {quote.author}</p>
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                            (quote.match_score || 0) > 0.85
                                                ? "bg-green-100 text-green-700"
                                                : "bg-gray-100 text-gray-600"
                                        )}>
                                            {Math.round((quote.match_score || 0) * 100)}% Match
                                        </span>
                                    </div>
                                    {selectedQuote === quote.quote && (
                                        <motion.p
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="text-xs text-blue-600 pt-1"
                                        >
                                            <Check className="w-3 h-3 inline mr-1" />
                                            Selected for introduction
                                        </motion.p>
                                    )}
                                </div>
                            </Label>
                        ))}
                    </RadioGroup>
                </div>

                {/* 3. Deep Dive (Collapsible) */}
                <div className="border-t border-[#E7E7E5]">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-between p-3 text-xs text-[#73726E] hover:bg-[#F5F5F4] transition-colors"
                    >
                        <span className="font-medium">View Detailed Intelligence</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-5 pt-0 space-y-6 bg-[#FAFAF9]">
                                    {/* LinkedIn Activity */}
                                    {linkedinActivity && linkedinActivity.length > 0 && (
                                        <div>
                                            <h5 className="text-xs font-semibold text-[#37352F] uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Linkedin className="w-3 h-3" />
                                                Recent LinkedIn Activity
                                            </h5>
                                            <div className="grid gap-3">
                                                {linkedinActivity.map((post, idx) => (
                                                    <div key={idx} className="bg-white p-3 rounded border border-[#E7E7E5]">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <Badge variant="secondary" className="text-[10px] px-1 h-5">{post.theme}</Badge>
                                                            <span className="text-[10px] text-[#A19F9D]">{post.date}</span>
                                                        </div>
                                                        <p className="text-xs text-[#37352F] line-clamp-2 mb-2">{post.content}</p>
                                                        <p className="text-[10px] text-[#73726E]">Engagement: {post.engagement}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Recent News */}
                                    <div>
                                        <h5 className="text-xs font-semibold text-[#37352F] uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Newspaper className="w-3 h-3" />
                                            Recent News
                                        </h5>
                                        <ul className="space-y-2">
                                            {news.map((item, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-xs text-[#37352F]">
                                                    <span className="text-[#A19F9D] mt-0.5">•</span>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </CardContent>
        </Card>
    )
}
