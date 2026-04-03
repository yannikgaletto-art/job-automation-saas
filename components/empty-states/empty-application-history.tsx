"use client"

import { FileText } from "lucide-react"
import { EmptyState } from "./empty-state"
import { useTranslations } from "next-intl"

export function EmptyApplicationHistory() {
    const t = useTranslations("dashboard.application_history")
    return (
        <EmptyState
            icon={FileText}
            title={t("empty_title")}
            description={t("empty_description")}
        />
    )
}
