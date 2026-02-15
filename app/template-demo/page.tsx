"use client"

import { TemplateGallery } from "@/components/onboarding/template-gallery"
import { useRouter } from "next/navigation"
import { useOnboardingStore } from "@/store/use-onboarding-store"

export default function TemplateDemoPage() {
    const router = useRouter()
    const { selectedTemplateId } = useOnboardingStore()

    const handleContinue = async () => {
        alert(`Selected template: ${selectedTemplateId}`)
        // In real flow, this would save to DB
    }

    const handleBack = () => {
        router.push('/dashboard')
    }

    return (
        <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
            <header className="p-6">
                <div className="flex items-center gap-2 text-[#37352F] font-bold text-xl">
                    <span>🚀 Pathly V2.0 - Template Selection Demo</span>
                </div>
            </header>

            <TemplateGallery onContinue={handleContinue} onBack={handleBack} />
        </div>
    )
}
