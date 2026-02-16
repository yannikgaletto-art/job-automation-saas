import { Briefcase } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyJobQueue({ onAddJob }: { onAddJob?: () => void }) {
    return (
        <EmptyState
            icon={Briefcase}
            title="No jobs in queue"
            description="Start by adding a job URL to automatically generate optimized applications."
            actionLabel="Add Your First Job"
            onAction={onAddJob}
        />
    )
}
