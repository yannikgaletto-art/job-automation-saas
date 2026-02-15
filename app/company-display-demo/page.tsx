"use client"

import { CompanyIntelCard } from "@/components/company/company-intel-card"
import { QuoteSelector } from "@/components/company/quote-selector"
import { useState } from "react"

export default function CompanyDisplayDemo() {
    const [selectedQuote, setSelectedQuote] = useState<any>(null)

    const mockCompanyValues = ["Innovation", "User-Centricity", "Transparency", "Move Fast"]
    const mockNews = [
        "Stripe launches new payment processing features for platforms",
        "Stripe expands into new markets in Southeast Asia",
        "Stripe valued at $65B in latest funding round"
    ]
    const mockLinkedinActivity = [
        {
            content: "We're thrilled to announce our new partnership with Salesforce to bring unified commerce to enterprise customers.",
            theme: "Partnership",
            engagement: "500+",
            date: "2 days ago"
        },
        {
            content: "Check out our engineering team's latest blog post on scaling Postgres databases.",
            theme: "Engineering",
            engagement: "1.2k",
            date: "1 week ago"
        }
    ]

    const mockQuotes = [
        {
            quote: "We are not just building a payments company, we are building the economic infrastructure of the internet.",
            author: "Patrick Collison (CEO)",
            relevance_score: 0.95,
            value_connection: "Aligns with 'Infrastructure' vision",
            matched_value: "Innovation",
            language: "en" as const
        },
        {
            quote: "The best way to predict the future is to create it.",
            author: "Alan Kay",
            relevance_score: 0.6,
            value_connection: "Matches 'Innovation' value",
            matched_value: "Innovation",
            language: "en" as const
        }
    ]


    return (
        <div className="min-h-screen bg-[#F5F5F4] p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-[#37352F] mb-2">Company Research Display Demo</h1>
                    <p className="text-[#73726E]">Verifying Phase 3.3 Components</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Intel Card */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-[#37352F]">Company Intel Card</h2>
                        <CompanyIntelCard
                            companyName="Stripe"
                            companyValues={mockCompanyValues}
                            recentNews={mockNews}
                            linkedinActivity={mockLinkedinActivity}
                            confidenceScore={0.85}
                            cachedAt={new Date().toISOString()}
                        />
                    </div>

                    {/* Right Column: Quote Selector */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-[#37352F]">Quote Selector</h2>
                        <div className="bg-white p-6 rounded-lg border border-[#E7E7E5]">
                            <QuoteSelector
                                quotes={mockQuotes}
                                onQuoteSelect={setSelectedQuote}
                            />

                            <div className="mt-8 p-4 bg-[#FAFAF9] rounded border border-[#E7E7E5]">
                                <h4 className="text-xs font-semibold text-[#73726E] mb-2 uppercase">Selected Quote State</h4>
                                <pre className="text-xs text-[#37352F] overflow-auto">
                                    {JSON.stringify(selectedQuote, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
