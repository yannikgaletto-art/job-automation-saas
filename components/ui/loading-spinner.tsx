
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg"
    className?: string
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "h-4 w-4",
        md: "h-6 w-6",
        lg: "h-8 w-8"
    }

    return (
        <Loader2
            className={cn("animate-spin text-gray-600", sizeClasses[size], className)}
        />
    )
}

// Full-screen loading overlay
export function LoadingOverlay({ message }: { message?: string }) {
    return (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
                <LoadingSpinner size="lg" />
                {message && <p className="text-sm text-gray-600 font-medium animate-pulse">{message}</p>}
            </div>
        </div>
    )
}
