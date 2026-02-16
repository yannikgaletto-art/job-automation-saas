
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

interface CardSkeletonProps {
    hasHeader?: boolean
    lines?: number
    className?: string
}

export function CardSkeleton({ hasHeader = true, lines = 3, className }: CardSkeletonProps) {
    return (
        <Card className={className}>
            {hasHeader && (
                <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-1/3 bg-gray-200" />
                    <Skeleton className="h-4 w-1/4 bg-gray-100" />
                </CardHeader>
            )}
            <CardContent className="space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="h-4 bg-gray-100"
                        style={{ width: `${100 - (i % 3) * 15}%` }}
                    />
                ))}
            </CardContent>
        </Card>
    )
}

// Grid of card skeletons
export function CardSkeletonGrid({ count = 3 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <CardSkeleton key={i} />
            ))}
        </div>
    )
}
