"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"

const MIN_PASSWORD_LENGTH = 8

/**
 * UpdatePasswordForm — Sets a new password after clicking the reset link.
 *
 * Security:
 *   - Session-Guard on mount: no session → redirect to login with expired error
 *   - Supabase sets a recovery session via auth/callback (PKCE code exchange)
 *   - updateUser({ password }) requires an active session
 *   - Client-side validation: min 8 chars, match confirmation
 */
function UpdatePasswordForm() {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [checking, setChecking] = useState(true)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)

    const router = useRouter()
    const supabase = createClient()
    const t = useTranslations('auth.update_password')

    // ── Session Guard ──────────────────────────────────────────────
    // If no session exists, the user either accessed this page directly
    // or the recovery link has expired. Redirect to login.
    useEffect(() => {
        async function checkSession() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.replace("/login?error=reset_link_expired")
                return
            }
            setChecking(false)
        }
        checkSession()
    }, [supabase, router])

    // ── Update Password Handler ────────────────────────────────────
    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault()
        setError("")

        // Client-side validation
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(t('error_min_length'))
            return
        }
        if (password !== confirmPassword) {
            setError(t('error_mismatch'))
            return
        }

        setLoading(true)

        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error

            setSuccess(true)

            // Auto-redirect after 2s success feedback
            setTimeout(() => {
                router.push("/dashboard")
                router.refresh()
            }, 2000)
        } catch (err: any) {
            console.error("❌ Password update failed:", err.message)
            setError(err.message || t('error_generic'))
        } finally {
            setLoading(false)
        }
    }

    // ── Loading: Session check ─────────────────────────────────────
    if (checking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
                <div className="w-8 h-8 border-2 border-[#012e7a] border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    // ── Success State ──────────────────────────────────────────────
    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
                <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-[#37352F] mb-2">{t('success')}</h2>
                    <p className="text-[#73726E] text-sm">{t('redirect_message')}</p>
                </div>
            </div>
        )
    }

    // ── Form ───────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
            <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm">
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#012e7a] to-[#1a4a9a] flex items-center justify-center">
                            <span className="text-white font-bold text-xl">P</span>
                        </div>
                        <h1 className="text-3xl font-bold text-[#37352F]">Pathly</h1>
                    </div>
                    <h2 className="text-2xl font-semibold text-[#37352F]">{t('title')}</h2>
                    <p className="text-[#73726E] mt-2">{t('subtitle')}</p>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('password_label')}</label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={MIN_PASSWORD_LENGTH}
                            placeholder="••••••••"
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('confirm_label')}</label>
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={MIN_PASSWORD_LENGTH}
                            placeholder="••••••••"
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    <Button type="submit" disabled={loading} className="w-full" variant="primary">
                        {loading ? t('submitting') : t('submit')}
                    </Button>
                </form>
            </div>
        </div>
    )
}

/**
 * UpdatePasswordPage — Suspense wrapper
 */
export default function UpdatePasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
                <div className="w-8 h-8 border-2 border-[#012e7a] border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <UpdatePasswordForm />
        </Suspense>
    )
}
