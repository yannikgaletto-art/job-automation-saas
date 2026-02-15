
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ConsentScreen } from "@/components/onboarding/consent-screen"
import { DocumentUpload } from "@/components/onboarding/document-upload"
import { TemplateGallery } from "@/components/onboarding/template-gallery"
import { ProfileConfirmation } from "@/components/onboarding/profile-confirmation"
import { motion, AnimatePresence } from "framer-motion"
import { useOnboardingStore } from "@/store/use-onboarding-store"

// Placeholder for future onboarding steps
enum OnboardingStep {
    CONSENT = "consent",
    UPLOAD = "upload",
    TEMPLATE = "template",
    PROFILE = "profile",
    COMPLETE = "complete"
}

export default function OnboardingPage() {
    const router = useRouter()
    const [currentStep, setCurrentStep] = useState<OnboardingStep>(OnboardingStep.CONSENT)

    // Zustand Store
    const { userId, setUserId, selectedTemplateId } = useOnboardingStore()

    const handleConsentComplete = async (consents: any[]) => {
        try {
            // TODO: Get actual user ID from auth context
            // For now, using a placeholder
            // Generate proper UUID for user_id
            const tempUserId = crypto.randomUUID()

            const response = await fetch('/api/consent/record', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: tempUserId,
                    consents: consents.map(c => ({
                        document_type: c.document_type,
                        document_version: c.document_version,
                        consent_given: true
                    }))
                })
            })

            if (!response.ok) {
                throw new Error('Failed to record consent')
            }

            setUserId(tempUserId)

            // Move to next step
            setCurrentStep(OnboardingStep.UPLOAD)

        } catch (error) {
            console.error('Error recording consent:', error)
            throw error
        }
    }

    const handleUploadComplete = async (files: { cv: File; coverLetters: File[] }) => {
        try {
            const formData = new FormData()
            formData.append('user_id', userId || crypto.randomUUID())
            formData.append('cv', files.cv)
            files.coverLetters.forEach((file, index) => {
                formData.append(`coverLetter_${index}`, file)
            })

            const response = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to upload documents')
            }

            const result = await response.json()
            console.log('Upload successful:', result)

            // Move to next step (template selection)
            setCurrentStep(OnboardingStep.TEMPLATE)
        } catch (error) {
            console.error('Error uploading documents:', error)
            throw error
        }
    }

    const handleUploadBack = () => {
        setCurrentStep(OnboardingStep.CONSENT)
    }

    const handleTemplateSelection = async () => {
        try {
            if (!userId) {
                console.warn("No User ID found, using fallback for dev mode")
            }

            const response = await fetch('/api/onboarding/template', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userId || 'dev-mode-fallback-id',
                    template_id: selectedTemplateId
                })
            })

            if (!response.ok) {
                throw new Error('Failed to save template selection')
            }

            // Move to next step
            setCurrentStep(OnboardingStep.PROFILE)

        } catch (error) {
            console.error('Error saving template:', error)
            // Ideally show toast here
            // Proceed anyway for dev flow if it's just a backend error
            setCurrentStep(OnboardingStep.PROFILE)
        }
    }

    const handleTemplateBack = () => {
        setCurrentStep(OnboardingStep.UPLOAD)
    }

    const handleSkip = () => {
        // For development, allow skipping to dashboard
        router.push('/dashboard')
    }

    return (
        <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
            <header className="p-6">
                <div className="flex items-center gap-2 text-[#37352F] font-bold text-xl">
                    <span>🚀 Pathly V2.0</span>
                </div>
            </header>

            <AnimatePresence mode="wait">
                {currentStep === OnboardingStep.CONSENT && (
                    <motion.div
                        key="consent"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <ConsentScreen
                            onComplete={handleConsentComplete}
                            onSkip={handleSkip}
                        />
                    </motion.div>
                )}

                {currentStep === OnboardingStep.UPLOAD && (
                    <motion.div
                        key="upload"
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                    >
                        <DocumentUpload
                            onComplete={handleUploadComplete}
                            onBack={handleUploadBack}
                        />
                    </motion.div>
                )}

                {currentStep === OnboardingStep.TEMPLATE && (
                    <motion.div
                        key="template"
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                    >
                        <TemplateGallery
                            onContinue={handleTemplateSelection}
                            onBack={handleTemplateBack}
                        />
                    </motion.div>
                )}

                {currentStep === OnboardingStep.PROFILE && (
                    <motion.div
                        key="profile"
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        className="w-full"
                    >
                        <ProfileConfirmation
                            userId={userId || "00000000-0000-0000-0000-000000000000"}
                            onComplete={() => router.push('/dashboard')}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
