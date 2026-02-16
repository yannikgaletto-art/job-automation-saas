import { Search } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyResearch() {
    return (
        <EmptyState
            icon={Search}
            title="No research available"
            description="Company research will be automatically fetched when you add a job."
        />
    )
}
