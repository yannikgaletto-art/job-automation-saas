import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorAlertProps {
    title?: string
    message: string
    onRetry?: () => void
    onDismiss?: () => void
}

export function ErrorAlert({
    title = "Something went wrong",
    message,
    onRetry,
    onDismiss
}: ErrorAlertProps) {
    return (
        <Alert variant="destructive" className="relative bg-red-50 border-red-200 text-red-900">
            {onDismiss && (
                <button
                    onClick={onDismiss}
                    className="absolute top-3 right-3 text-red-600 hover:text-red-800"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900 font-medium">{title}</AlertTitle>
            <AlertDescription className="mt-2 text-red-800">
                {message}
                {onRetry && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="mt-3 border-red-200 hover:bg-red-100 text-red-900"
                    >
                        <RefreshCw className="h-3 w-3 mr-2" />
                        Try Again
                    </Button>
                )}
            </AlertDescription>
        </Alert>
    )
}
