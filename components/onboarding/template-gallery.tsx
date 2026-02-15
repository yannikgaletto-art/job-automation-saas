
"use client"

import { motion } from "framer-motion"
import { Check, LayoutTemplate } from "lucide-react"
import { useOnboardingStore } from "@/store/use-onboarding-store"
import { cn } from "@/lib/utils"

const TEMPLATES = [
    {
        id: "notion_modern",
        name: "Modern Notion",
        description: "Clean, minimalist design inspired by Notion docs.",
        previewColor: "bg-stone-100" // Placeholder for image
    },
    {
        id: "classic_corporate",
        name: "Classic Corporate",
        description: "Professional layout suitable for traditional industries.",
        previewColor: "bg-blue-50" // Placeholder for image
    },
    {
        id: "creative_minimal",
        name: "Creative Minimal",
        description: "Bold typography with plenty of whitespace.",
        previewColor: "bg-purple-50" // Placeholder for image
    }
]

interface TemplateGalleryProps {
    onContinue: () => void
    onBack: () => void
}

export function TemplateGallery({ onContinue, onBack }: TemplateGalleryProps) {
    const { selectedTemplateId, setTemplateId } = useOnboardingStore()

    return (
        <div className="w-full max-w-5xl mx-auto px-4 py-8">
            <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-[#37352F] mb-2">Choose your Template</h2>
                <p className="text-gray-500">
                    Select a style for your CV. You can change this later.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {TEMPLATES.map((template) => (
                    <motion.div
                        key={template.id}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setTemplateId(template.id)}
                        className={cn(
                            "group cursor-pointer rounded-xl border-2 transition-all overflow-hidden relative",
                            selectedTemplateId === template.id
                                ? "border-blue-600 shadow-md ring-2 ring-blue-600/20"
                                : "border-[#E7E7E5] hover:border-blue-400 hover:shadow-sm"
                        )}
                    >
                        {/* Selection Indicator */}
                        {selectedTemplateId === template.id && (
                            <div className="absolute top-3 right-3 z-10 bg-blue-600 text-white p-1.5 rounded-full shadow-sm">
                                <Check className="w-4 h-4" />
                            </div>
                        )}

                        {/* Preview Area (Placeholder) */}
                        <div className={cn("aspect-[3/4] w-full flex items-center justify-center", template.previewColor)}>
                            <div className="text-center p-4">
                                <LayoutTemplate className={cn(
                                    "w-12 h-12 mx-auto mb-3 opacity-50",
                                    selectedTemplateId === template.id ? "text-blue-600" : "text-gray-400"
                                )} />
                                <span className="text-sm font-medium text-gray-500 block">
                                    {template.name} Preview
                                </span>
                            </div>
                        </div>

                        {/* Meta Info */}
                        <div className="p-4 bg-white border-t border-gray-100">
                            <h3 className={cn(
                                "font-semibold mb-1",
                                selectedTemplateId === template.id ? "text-blue-600" : "text-[#37352F]"
                            )}>
                                {template.name}
                            </h3>
                            <p className="text-xs text-gray-500 line-clamp-2">
                                {template.description}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                <button
                    onClick={onBack}
                    className="px-6 py-2.5 text-gray-600 font-medium hover:text-gray-900 transition-colors"
                >
                    Back
                </button>
                <button
                    onClick={onContinue}
                    className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                    Continue
                </button>
            </div>
        </div>
    )
}
