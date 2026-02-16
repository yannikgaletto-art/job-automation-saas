import { Upload } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyDocuments({ onUpload }: { onUpload: () => void }) {
    return (
        <EmptyState
            icon={Upload}
            title="No documents uploaded"
            description="Upload your CV and sample cover letters to train the AI on your writing style."
            actionLabel="Upload Documents"
            onAction={onUpload}
        />
    )
}
