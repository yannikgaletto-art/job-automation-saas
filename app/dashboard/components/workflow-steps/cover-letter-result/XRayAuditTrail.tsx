"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Building2, Target, Puzzle, Info } from "lucide-react"
import type { AuditTrailCard } from "@/types/cover-letter-setup"

interface XRayAuditTrailProps {
    cards: AuditTrailCard[]
}

const categoryConfig: Record<AuditTrailCard['category'], {
    icon: typeof Sparkles
    color: string
    borderColor: string
    bgColor: string
    label: string
}> = {
    user_voice: {
        icon: Sparkles,
        color: 'text-emerald-600',
        borderColor: 'border-l-emerald-500',
        bgColor: 'bg-emerald-50',
        label: 'Schreibstil',
    },
    company_insight: {
        icon: Building2,
        color: 'text-blue-600',
        borderColor: 'border-l-blue-500',
        bgColor: 'bg-blue-50',
        label: 'Firmen-Insight',
    },
    job_fit: {
        icon: Target,
        color: 'text-purple-600',
        borderColor: 'border-l-purple-500',
        bgColor: 'bg-purple-50',
        label: 'Job-Match',
    },
    module_trace: {
        icon: Puzzle,
        color: 'text-orange-600',
        borderColor: 'border-l-orange-500',
        bgColor: 'bg-orange-50',
        label: 'Feature',
    },
}

function AuditCard({ card, index }: { card: AuditTrailCard; index: number }) {
    const config = categoryConfig[card.category] || categoryConfig.job_fit
    const Icon = config.icon

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className={`border border-gray-200 ${config.borderColor} border-l-[3px] rounded-lg p-3.5 ${config.bgColor}/40`}
        >
            <div className="flex items-start gap-2.5">
                <div className={`${config.bgColor} p-1.5 rounded-md shrink-0 mt-0.5`}>
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-semibold text-[#37352F]">{card.title}</h4>
                        {card.moduleName && (
                            <span className="text-[10px] font-medium bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                                {card.moduleName}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[#73726E] mt-1 leading-relaxed">{card.detail}</p>
                    {card.reference && (
                        <p className="text-[10px] text-[#9B9A97] mt-1.5 italic">{card.reference}</p>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

export function XRayAuditTrail({ cards }: XRayAuditTrailProps) {
    if (!cards || cards.length === 0) {
        return (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start gap-3">
                <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-sm font-semibold text-[#73726E]">Audit Trail</h4>
                    <p className="text-xs text-[#9B9A97] mt-1">
                        Der Audit Trail konnte nicht erstellt werden. Dein Anschreiben ist trotzdem vollständig.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Warum dein Brief funktioniert
            </h4>
            <AnimatePresence>
                <div className="space-y-2">
                    {cards.map((card, i) => (
                        <AuditCard key={`${card.category}-${i}`} card={card} index={i} />
                    ))}
                </div>
            </AnimatePresence>
        </div>
    )
}
