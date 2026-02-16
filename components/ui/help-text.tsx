import { Info } from "lucide-react"

interface HelpTextProps {
    children: React.ReactNode
}

export function HelpText({ children }: HelpTextProps) {
    return (
        <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">{children}</div>
        </div>
    )
}
