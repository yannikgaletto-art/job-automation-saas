export function getUserFriendlyErrorMessage(error: unknown): string {
    if (typeof error === "string") return error

    if (error instanceof Error) {
        // Network errors
        if (error.message.includes("fetch") || error.message.includes("network")) {
            return "Connection error. Please check your internet and try again."
        }

        // API errors
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
            return "Your session has expired. Please log in again."
        }

        if (error.message.includes("403") || error.message.includes("Forbidden")) {
            return "You don't have permission to perform this action."
        }

        if (error.message.includes("404") || error.message.includes("Not found")) {
            return "The requested resource was not found."
        }

        if (error.message.includes("500")) {
            return "Server error. Our team has been notified. Please try again later."
        }

        // Validation errors
        if (error.message.includes("validation") || error.message.includes("invalid")) {
            return "Please check your input and try again."
        }

        // File upload errors
        if (error.message.includes("file") || error.message.includes("upload")) {
            return "File upload failed. Please ensure the file is under 5MB and try again."
        }

        // Duplicate errors
        if (error.message.includes("duplicate") || error.message.includes("already applied")) {
            return "You've already applied to this job recently."
        }

        // Rate limit errors
        if (error.message.includes("rate limit") || error.message.includes("too many")) {
            return "You're doing that too often. Please wait a moment and try again."
        }

        // Default: Return original message if not too technical
        if (error.message.length < 100 && !error.message.includes("Error:")) {
            return error.message
        }
    }

    // Fallback
    return "An unexpected error occurred. Please try again."
}
