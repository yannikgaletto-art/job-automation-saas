
import { Skeleton } from "@/components/ui/skeleton"

interface FormSkeletonProps {
    fields?: number
}

export function FormSkeleton({ fields = 4 }: FormSkeletonProps) {
    return (
        <div className="space-y-6 max-w-xl">
            {Array.from({ length: fields }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24 bg-gray-200" /> {/* Label */}
                    <Skeleton className="h-10 w-full bg-gray-100 rounded-md" /> {/* Input */}
                </div>
            ))}
            <Skeleton className="h-10 w-32 bg-gray-200 rounded-md mt-4" /> {/* Button */}
        </div>
    )
}
