import { Briefcase } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyJobQueue({ onAddJob }: { onAddJob?: () => void }) {
    return (
        <EmptyState
            icon={Briefcase}
            title="Noch keine Jobs in der Queue"
            description="Füge eine Job-URL hinzu, um automatisch optimierte Bewerbungen zu erstellen."
            actionLabel="Ersten Job hinzufügen"
            onAction={onAddJob}
        />
    )
}
