import { FileText } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyApplicationHistory() {
    return (
        <EmptyState
            icon={FileText}
            title="No applications yet"
            description="Your application history will appear here once you start applying to jobs."
        />
    )
}
