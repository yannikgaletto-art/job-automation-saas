"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, LayoutTemplate, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export const TEMPLATES = [
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

interface TemplateSelectorProps {
    initialTemplateId?: string;
    onSelected?: (templateId: string) => void;
}

export function TemplateSelector({ initialTemplateId = "notion_modern", onSelected }: TemplateSelectorProps) {
    const [selectedId, setSelectedId] = useState(initialTemplateId);
    const [isSaving, setIsSaving] = useState(false);

    const handleSelect = async (id: string) => {
        setSelectedId(id);
        setIsSaving(true);
        try {
            const res = await fetch('/api/onboarding/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template_id: id })
            });
            if (res.ok) {
                onSelected?.(id);
            }
        } catch (error) {
            console.error("Failed to save template", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h3 className="text-xl font-bold text-[#37352F] mb-1">Select CV Template</h3>
                <p className="text-sm text-gray-500">
                    Choose a layout for your optimized CV. You can change this later.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {TEMPLATES.map((template) => (
                    <motion.div
                        key={template.id}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleSelect(template.id)}
                        className={cn(
                            "group cursor-pointer rounded-xl border-2 transition-all overflow-hidden relative",
                            selectedId === template.id
                                ? "border-blue-600 shadow-md ring-2 ring-blue-600/20"
                                : "border-[#E7E7E5] hover:border-blue-400 hover:shadow-sm",
                            isSaving && selectedId !== template.id ? "opacity-50 pointer-events-none" : ""
                        )}
                    >
                        {/* Selection Indicator */}
                        {selectedId === template.id && (
                            <div className="absolute top-3 right-3 z-10 bg-blue-600 text-white p-1.5 rounded-full shadow-sm">
                                {isSaving && selectedId === template.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </div>
                        )}

                        {/* Preview Area (Placeholder) */}
                        <div className={cn("aspect-[3/4] w-full flex items-center justify-center", template.previewColor)}>
                            <div className="text-center p-4">
                                <LayoutTemplate className={cn(
                                    "w-12 h-12 mx-auto mb-3",
                                    selectedId === template.id ? "text-blue-600 opacity-80" : "text-gray-400 opacity-50"
                                )} />
                                <span className={cn(
                                    "text-sm font-medium block",
                                    selectedId === template.id ? "text-blue-700" : "text-gray-500"
                                )}>
                                    {template.name} Preview
                                </span>
                            </div>
                        </div>

                        {/* Meta Info */}
                        <div className="p-4 bg-white border-t border-gray-100">
                            <h3 className={cn(
                                "font-semibold mb-1",
                                selectedId === template.id ? "text-blue-600" : "text-[#37352F]"
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
        </div>
    )
}
