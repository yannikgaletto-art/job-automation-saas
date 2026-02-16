import { useState } from "react"
import { getUserFriendlyErrorMessage } from "@/lib/utils/error-messages"

export function useRetry<T>(
    asyncFn: () => Promise<T>,
    maxRetries = 3
) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)

    async function execute() {
        setIsLoading(true)
        setError(null)

        try {
            const result = await asyncFn()
            setRetryCount(0)
            return result
        } catch (err) {
            const message = getUserFriendlyErrorMessage(err)
            setError(message)
            throw err
        } finally {
            setIsLoading(false)
        }
    }

    async function retry() {
        if (retryCount >= maxRetries) {
            setError("Maximum retry attempts reached. Please try again later.")
            return
        }

        setRetryCount(prev => prev + 1)
        return execute()
    }

    return { execute, retry, isLoading, error, retryCount, canRetry: retryCount < maxRetries }
}
