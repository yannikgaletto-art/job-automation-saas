"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle } from "lucide-react"

interface ConsentItem {
    id: string
    document_type: "privacy_policy" | "terms_of_service" | "ai_processing" | "cookies"
    document_version: string
    label: string
    description: string
    required: boolean
}

const CONSENT_ITEMS: ConsentItem[] = [
    {
        id: "privacy",
        document_type: "privacy_policy",
        document_version: "v1.2",
        label: "Datenschutzerklärung (Privacy Policy)",
        description: "Ich habe die Datenschutzerklärung gelesen und akzeptiere die Verarbeitung meiner Daten gemäß DSGVO.",
        required: true
    },
    {
        id: "terms",
        document_type: "terms_of_service",
        document_version: "v1.2",
        label: "Nutzungsbedingungen (Terms of Service)",
        description: "Ich akzeptiere die Nutzungsbedingungen und verpflichte mich, den Service verantwortungsvoll zu nutzen.",
        required: true
    },
    {
        id: "ai",
        document_type: "ai_processing",
        document_version: "v1.0",
        label: "KI-Verarbeitung meiner Texte",
        description: "Ich stimme zu, dass meine hochgeladenen Dokumente (CV, Anschreiben) zur Erstellung personalisierter Bewerbungen mit KI verarbeitet werden.",
        required: true
    },
    {
        id: "cookies",
        document_type: "cookies",
        document_version: "v1.1",
        label: "Cookie-Richtlinien",
        description: "Ich akzeptiere die Verwendung von Cookies zur Verbesserung der Nutzererfahrung.",
        required: true
    }
]

interface ConsentScreenProps {
    onComplete: (consents: ConsentItem[]) => Promise<void>
    onSkip?: () => void
}

export function ConsentScreen({ onComplete, onSkip }: ConsentScreenProps) {
    const [consents, setConsents] = useState<Record<string, boolean>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleToggle = (id: string) => {
        setConsents(prev => ({
            ...prev,
            [id]: !prev[id]
        }))
    }

    const allRequiredSelected = CONSENT_ITEMS
        .filter(item => item.required)
        .every(item => consents[item.id])

    const handleSubmit = async () => {
        if (!allRequiredSelected) return

        setIsSubmitting(true)
        setError(null)

        try {
            const selectedConsents = CONSENT_ITEMS.filter(item => consents[item.id])
            await onComplete(selectedConsents)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full max-w-2xl"
            >
                <Card className="bg-white border-[#E7E7E5] shadow-sm rounded-xl overflow-hidden">
                    <CardHeader className="text-center pt-8 pb-2">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#f0f7ff] text-[#0066FF] mx-auto"
                        >
                            <CheckCircle2 className="w-6 h-6" />
                        </motion.div>

                        <CardTitle className="text-2xl font-semibold text-[#37352F]">
                            Willkommen bei Pathly
                        </CardTitle>

                        <CardDescription className="text-[#73726E] text-base mt-2">
                            Bevor wir beginnen, benötigen wir Ihre Zustimmung
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6 pt-6 px-8">
                        {error && (
                            <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
                                <AlertCircle className="h-4 w-4 text-red-600" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-3">
                            {CONSENT_ITEMS.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 * (index + 1) }}
                                    className={`
                                        flex items-start space-x-4 p-4 rounded-lg border transition-all duration-200
                                        ${consents[item.id]
                                            ? 'bg-[#F0F7FF] border-[#0066FF]/20'
                                            : 'bg-white border-[#E7E7E5] hover:bg-[#FAFAF9]'}
                                    `}
                                    onClick={() => handleToggle(item.id)}
                                >
                                    <Checkbox
                                        id={item.id}
                                        checked={consents[item.id] || false}
                                        onCheckedChange={() => handleToggle(item.id)}
                                        className={`mt-1 data-[state=checked]:bg-[#0066FF] data-[state=checked]:border-[#0066FF] border-[#D6D6D3]`}
                                    />
                                    <div className="flex-1 cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-[#37352F]">
                                                {item.label}
                                            </span>
                                            {item.required && (
                                                <span className="text-[10px] font-medium text-[#0066FF] bg-[#0066FF]/10 px-1.5 py-0.5 rounded">
                                                    REQUIRED
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-[#73726E] mt-1 leading-relaxed">
                                            {item.description}
                                        </p>
                                        <p className="text-xs text-[#A8A29E] mt-1.5 font-mono">
                                            {item.document_version}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="bg-[#F7F7F5] border border-[#E7E7E5] rounded-lg p-4 flex gap-3 text-sm text-[#73726E]">
                            <div className="shrink-0 pt-0.5">ℹ️</div>
                            <p>
                                <strong>DSGVO-Hinweis:</strong> Ihre Daten werden verschlüsselt gespeichert und ausschließlich für Ihre Bewerbungen genutzt.
                            </p>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col sm:flex-row gap-3 px-8 pb-8 pt-2">
                        {onSkip && (
                            <Button
                                variant="ghost"
                                onClick={onSkip}
                                className="w-full sm:w-auto text-[#73726E] hover:text-[#37352F] hover:bg-[#F7F7F5]"
                            >
                                Überspringen
                            </Button>
                        )}

                        <Button
                            onClick={handleSubmit}
                            disabled={!allRequiredSelected || isSubmitting}
                            className={`
                                w-full sm:flex-1 text-white shadow-sm transition-all
                                ${!allRequiredSelected || isSubmitting
                                    ? 'bg-[#E7E7E5] text-[#A8A29E]'
                                    : 'bg-[#0066FF] hover:bg-[#0052CC] hover:shadow-md'}
                            `}
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Wird verarbeitet...
                                </>
                            ) : (
                                <>Zustimmen und fortfahren</>
                            )}
                        </Button>
                    </CardFooter>
                </Card>

                <p className="text-center text-[#A8A29E] text-xs mt-6">
                    Mit dem Klick akzeptieren Sie unsere Richtlinien.
                </p>
            </motion.div>
        </div>
    )
}
