
"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/motion/button"
import { ExternalLink } from "lucide-react"

interface ConsentItem {
    type: "privacy_policy" | "terms_of_service" | "ai_processing" | "cookies"
    label: string
    description: string
    required: boolean
    documentUrl: string
}

interface ConsentScreenProps {
    onComplete: (consents: { document_type: string; document_version: string }[]) => void
    onSkip?: () => void
}

export function ConsentScreen({ onComplete, onSkip }: ConsentScreenProps) {
    const [consents, setConsents] = useState<Record<string, boolean>>({
        privacy_policy: false,
        terms_of_service: false,
        ai_processing: false,
        cookies: false
    })

    const [isSubmitting, setIsSubmitting] = useState(false)

    const consentItems: ConsentItem[] = [
        {
            type: "privacy_policy",
            label: "Privacy Policy",
            description: "I agree to the collection and processing of my personal data as described.",
            required: true,
            documentUrl: "/legal/privacy-policy"
        },
        {
            type: "terms_of_service",
            label: "Terms of Service",
            description: "I accept the terms and conditions of using this service.",
            required: true,
            documentUrl: "/legal/terms-of-service"
        },
        {
            type: "ai_processing",
            label: "AI Processing",
            description: "I consent to my data being processed by AI models (Claude API) for document generation.",
            required: true,
            documentUrl: "/legal/ai-processing"
        },
        {
            type: "cookies",
            label: "Cookie Policy",
            description: "I accept the use of essential cookies for authentication.",
            required: true,
            documentUrl: "/legal/cookie-policy"
        }
    ]

    const allRequiredConsentsGiven = consentItems
        .filter(item => item.required)
        .every(item => consents[item.type])

    const handleSubmit = async () => {
        setIsSubmitting(true)

        // Prepare data for callback
        const consentData = Object.entries(consents)
            .filter(([_, given]) => given)
            .map(([type]) => ({
                document_type: type,
                document_version: "v1.0" // Hardcoded version for now
            }))

        await onComplete(consentData)
        setIsSubmitting(false)
    }

    return (
        <div className="max-w-2xl mx-auto p-8 bg-white/50 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm">
            <h1 className="text-3xl font-bold mb-2 text-[#37352F]">Before We Start</h1>
            <p className="text-gray-600 mb-8">
                To use Pathly, we need your consent for the following:
            </p>

            <div className="space-y-4 mb-8">
                {consentItems.map(item => (
                    <div key={item.type} className="flex items-start gap-4 p-4 border border-gray-100 bg-white rounded-lg hover:border-gray-300 transition-colors">
                        <Checkbox
                            checked={consents[item.type]}
                            onCheckedChange={(checked) =>
                                setConsents(prev => ({ ...prev, [item.type]: checked === true }))
                            }
                            className="mt-1"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <label className="font-medium text-[#37352F]">{item.label}</label>
                                {item.required && (
                                    <span className="text-xs text-red-500 font-medium">*Required</span>
                                )}
                                <a
                                    href={item.documentUrl}
                                    target="_blank"
                                    className="text-blue-600 hover:text-blue-800 transition-colors"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-4">
                <Button
                    onClick={handleSubmit}
                    disabled={!allRequiredConsentsGiven || isSubmitting}
                    className="w-full"
                    size="lg"
                >
                    {isSubmitting ? "Saving..." : "Continue"}
                </Button>
            </div>

            <p className="text-xs text-gray-400 mt-6 text-center">
                You can withdraw your consent at any time in your account settings.
            </p>
        </div>
    )
}
