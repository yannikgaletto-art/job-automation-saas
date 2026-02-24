'use client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <html>
            <body className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                    <div className="text-4xl">⚠️</div>
                    <h2 className="text-xl font-semibold text-[#37352F]">
                        Etwas ist schiefgelaufen
                    </h2>
                    <p className="text-[#73726E] text-sm">
                        Das Team wurde automatisch benachrichtigt.
                    </p>
                    <button
                        onClick={reset}
                        className="px-4 py-2 bg-[#1B4332] text-white rounded-lg 
                       text-sm hover:bg-[#1B4332]/90 transition-colors"
                    >
                        Nochmal versuchen
                    </button>
                </div>
            </body>
        </html>
    )
}
