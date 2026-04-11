'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * PKCE Auth Callback for Browser Extension
 *
 * Flow:
 * 1. Extension opens this page in a new tab
 * 2. Page reads Supabase session via COOKIE-AWARE browser client
 *    (NOT raw @supabase/supabase-js — that can't read cookies!)
 * 3. Redirects to self with tokens in hash fragment (#access_token=...)
 * 4. Extension's chrome.tabs.onUpdated catches the URL change
 * 5. Extension stores tokens + closes this tab
 *
 * Security: Token is in URL fragment — never sent to server (HTTP spec)
 * Location: /auth/* — middleware skips these paths (no locale, no auth guard)
 */
export default function ExtensionAuthCallback() {
    const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // GUARD: If fragment already has access_token, we're on the second load.
        // The Background Worker is reading the URL. Just show "Done" and wait
        // for it to close this tab. Do NOT redirect again.
        if (window.location.hash.includes('access_token')) {
            setStatus('done')
            return
        }

        async function handleAuth() {
            try {
                // Use the SaaS's cookie-aware browser client (createBrowserClient from @supabase/ssr)
                // This reads the existing session from cookies — works when user is already logged in
                const supabase = createClient()

                const { data: { session }, error: sessionError } = await supabase.auth.getSession()

                if (sessionError || !session) {
                    // Not logged in — show error with login link
                    // (We can't redirect to /login because middleware would intercept
                    // and redirect back to /dashboard if user IS logged in via cookies,
                    // losing the returnTo parameter entirely)
                    setStatus('error')
                    setError('Bitte zuerst in Pathly einloggen.')
                    return
                }

                // Build fragment with tokens (never sent to server — HTTP spec)
                const fragment = new URLSearchParams({
                    access_token: session.access_token,
                    refresh_token: session.refresh_token ?? '',
                    expires_in: String(session.expires_in || 3600),
                }).toString()

                // Redirect to self with fragment.
                // Extension's chrome.tabs.onUpdated fires, reads fragment, closes tab.
                window.location.href = `/auth/extension/callback#${fragment}`

            } catch {
                setStatus('error')
                setError('Authentifizierung fehlgeschlagen.')
            }
        }

        handleAuth()
    }, [])

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-white mb-6">
                    🔗 Pathly Extension
                </h1>

                {status === 'loading' && (
                    <div className="text-yellow-400 bg-yellow-900/20 rounded-lg p-4">
                        <p className="text-xl">⏳ Verbinde…</p>
                    </div>
                )}

                {status === 'done' && (
                    <div className="text-green-400 bg-green-900/20 rounded-lg p-4">
                        <p className="text-xl mb-2">✅ Verbunden!</p>
                        <p className="text-slate-400 text-sm">
                            Dieses Tab schließt sich automatisch.
                        </p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="text-red-400 bg-red-900/20 rounded-lg p-4">
                        <p className="mb-3">❌ {error}</p>
                        <a
                            href="/login"
                            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                        >
                            Zum Login →
                        </a>
                    </div>
                )}

            </div>
        </div>
    )
}
