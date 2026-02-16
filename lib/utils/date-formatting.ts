import { formatDistanceToNow, format } from "date-fns"

export function formatAppliedDate(isoDate: string): string {
    const date = new Date(isoDate)
    const now = new Date()
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)

    if (diffDays < 7) {
        return formatDistanceToNow(date, { addSuffix: true }) // "2 days ago"
    } else {
        return format(date, "MMM d, yyyy") // "Feb 15, 2026"
    }
}
