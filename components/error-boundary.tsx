"use client"

import React, { Component, ReactNode } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error?: Error
    isChunkError: boolean
    autoReloading: boolean
}

/**
 * Global Error Boundary — Root-level guard for all unhandled React errors.
 *
 * Chunk Loading Error Recovery (2026-04-18):
 * After a Vercel deployment, browsers with cached HTML reference stale chunk
 * hashes. Next.js throws "ChunkLoadError" or "Loading chunk N failed".
 * This boundary detects these and triggers an automatic hard reload (once)
 * which forces the browser to fetch the new chunks from the latest deployment.
 *
 * Rate limit: stored in sessionStorage('pathly_chunk_reload_at') — only one
 * auto-reload per 10 seconds to prevent infinite loops on genuine 404 errors.
 */
function isChunkLoadError(error: Error): boolean {
    const msg = error?.message ?? ''
    const name = error?.name ?? ''
    return (
        name === 'ChunkLoadError' ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('Importing a module script failed')
    )
}

const CHUNK_RELOAD_KEY = 'pathly_chunk_reload_at'
const CHUNK_RELOAD_COOLDOWN_MS = 10_000 // 10 seconds cooldown to prevent loops

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, isChunkError: false, autoReloading: false }
    }

    static getDerivedStateFromError(error: Error): State {
        const chunkError = isChunkLoadError(error)
        return { hasError: true, error, isChunkError: chunkError, autoReloading: false }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        if (isChunkLoadError(error)) {
            console.warn('[ErrorBoundary] Chunk load error detected — checking auto-reload eligibility', error.message)
            this.tryAutoReload()
        } else {
            console.error('❌ Error caught by boundary:', error, errorInfo)
        }
    }

    tryAutoReload() {
        try {
            const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY)
            const now = Date.now()

            if (lastReload && now - parseInt(lastReload, 10) < CHUNK_RELOAD_COOLDOWN_MS) {
                // Already reloaded recently — don't loop. Show manual error UI instead.
                console.warn('[ErrorBoundary] Chunk reload cooldown active — skipping auto-reload')
                return
            }

            // Mark and reload
            sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
            this.setState({ autoReloading: true })
            console.log('[ErrorBoundary] Auto-reloading to recover from stale deployment chunks...')
            window.location.reload()
        } catch {
            // sessionStorage not available (e.g. private mode) — reload anyway
            window.location.reload()
        }
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }

            // Auto-reloading spinner
            if (this.state.autoReloading) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
                        <RefreshCw className="h-8 w-8 text-[#012e7a] animate-spin mb-4" />
                        <p className="text-sm text-[#73726E]">Seite wird aktualisiert…</p>
                    </div>
                )
            }

            // Chunk error with manual reload button (after cooldown, or if auto-reload failed)
            if (this.state.isChunkError) {
                return (
                    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
                        <div className="rounded-full bg-amber-100 p-3 mb-4">
                            <RefreshCw className="h-8 w-8 text-amber-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-[#37352F] mb-2">
                            Da ist etwas schiefgelaufen!
                        </h2>
                        <p className="text-sm text-[#73726E] mb-2 text-center max-w-md">
                            Eine neue Version von Pathly wurde bereitgestellt. Bitte lade die Seite neu, um fortzufahren.
                        </p>
                        <p className="text-xs text-[#A8A29E] mb-6 text-center max-w-md">
                            Deine Daten sind sicher — es handelt sich nur um ein Browser-Cache-Update.
                        </p>
                        <Button
                            onClick={() => window.location.reload()}
                            className="bg-[#012e7a] hover:bg-[#011f5e] text-white"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Erneut versuchen
                        </Button>
                    </div>
                )
            }

            // Generic error
            return (
                <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
                    <div className="rounded-full bg-red-100 p-3 mb-4">
                        <AlertCircle className="h-8 w-8 text-red-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-[#37352F] mb-2">
                        Da ist etwas schiefgelaufen!
                    </h2>
                    <p className="text-sm text-[#73726E] mb-6 text-center max-w-md">
                        Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.
                    </p>
                    <Button
                        onClick={() => window.location.reload()}
                        className="bg-[#012e7a] hover:bg-[#011f5e] text-white"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Seite neu laden
                    </Button>
                    {process.env.NODE_ENV === "development" && this.state.error && (
                        <pre className="mt-6 p-4 bg-gray-100 rounded text-xs overflow-auto max-w-2xl text-left">
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            )
        }

        return this.props.children
    }
}
